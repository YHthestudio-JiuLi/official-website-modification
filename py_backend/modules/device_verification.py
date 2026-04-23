from __future__ import annotations

import base64
import time
import sqlite3
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple
from fastapi import  HTTPException, status
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend

from ..utils import row_to_dict, rows_to_dict


class DeviceVerificationManager:
    # 禁用验证的时间段列表 [(start_month, start_day, end_month, end_day), ...]
    DISABLED_PERIODS = [
        (6, 5, 6, 10),  # 6月5日到6月10日
    ]

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def _is_verification_disabled(self) -> Tuple[bool, str]:
        """检查当前时间是否在禁用时间段内"""
        today = date.today()
        current_month = today.month
        current_day = today.day
        
        for start_month, start_day, end_month, end_day in self.DISABLED_PERIODS:
            start_date = date(today.year, start_month, start_day)
            end_date = date(today.year, end_month, end_day)
            
            if start_date <= today <= end_date:
                return True, f"Verification disabled from {start_month}/{start_day} to {end_month}/{end_day}"
        
        return False, ""

    def add_disabled_period(self, start_month: int, start_day: int, end_month: int, end_day: int) -> None:
        """添加禁用时间段"""
        period = (start_month, start_day, end_month, end_day)
        if period not in self.DISABLED_PERIODS:
            self.DISABLED_PERIODS.append(period)

    def remove_disabled_period(self, start_month: int, start_day: int, end_month: int, end_day: int) -> bool:
        """移除禁用时间段"""
        period = (start_month, start_day, end_month, end_day)
        if period in self.DISABLED_PERIODS:
            self.DISABLED_PERIODS.remove(period)
            return True
        return False

    def get_disabled_periods(self) -> List[Dict[str, int]]:
        """获取所有禁用时间段"""
        return [
            {"start_month": s[0], "start_day": s[1], "end_month": s[2], "end_day": s[3]}
            for s in self.DISABLED_PERIODS
        ]

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS device_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT UNIQUE NOT NULL,
                verification_count INTEGER NOT NULL DEFAULT 0,
                max_verifications INTEGER NOT NULL DEFAULT 10,
                is_whitelisted INTEGER NOT NULL DEFAULT 0,
                private_key TEXT NOT NULL,
                public_key TEXT NOT NULL,
                question_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_device_verifications_device_id ON device_verifications(device_id)"
        )
        
        # 迁移：如果旧表没有 question_id 字段，则添加
        self.cur.execute("PRAGMA table_info(device_verifications)")
        columns = [col[1] for col in self.cur.fetchall()]
        if "question_id" not in columns:
            self.conn.execute("ALTER TABLE device_verifications ADD COLUMN question_id INTEGER")
        if "firmware_id" not in columns:
            self.conn.execute("ALTER TABLE device_verifications ADD COLUMN firmware_id INTEGER")
        if "is_whitelisted" not in columns:
            # 迁移：历史设备默认按已授权处理，避免升级后现有设备全部失效
            self.conn.execute("ALTER TABLE device_verifications ADD COLUMN is_whitelisted INTEGER NOT NULL DEFAULT 1")
        
        # 创建索引（迁移后）
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_device_verifications_question_id ON device_verifications(question_id)"
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_device_verifications_firmware_id ON device_verifications(firmware_id)"
        )
        
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS device_verification_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                issued_at INTEGER NOT NULL,
                signature TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_device_verification_logs_device_id ON device_verification_logs(device_id)"
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_device_verification_logs_created_at ON device_verification_logs(created_at)"
        )
        # 全局策略：同一 device_id 在 N 秒内重复调用 /verify 不增加 verification_count（返回最近一次签名）
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS device_verification_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                verify_cooldown_seconds INTEGER NOT NULL DEFAULT 0,
                default_firmware_id INTEGER
            )
            """
        )
        self.cur.execute("PRAGMA table_info(device_verification_settings)")
        settings_columns = [col[1] for col in self.cur.fetchall()]
        if "default_firmware_id" not in settings_columns:
            self.conn.execute("ALTER TABLE device_verification_settings ADD COLUMN default_firmware_id INTEGER")
        self.conn.execute(
            "INSERT OR IGNORE INTO device_verification_settings (id, verify_cooldown_seconds) VALUES (1, 0)"
        )
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS nano_firmware_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                file_url TEXT NOT NULL UNIQUE,
                file_size INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_nano_firmware_files_created_at ON nano_firmware_files(created_at)"
        )

    def get_settings(self) -> Dict[str, Any]:
        """读取设备验证全局设置（单行）。"""
        self.cur.execute(
            "SELECT verify_cooldown_seconds, default_firmware_id FROM device_verification_settings WHERE id = 1"
        )
        row = self.cur.fetchone()
        if row is None:
            return {"verify_cooldown_seconds": 0, "default_firmware_id": None}
        return {
            "verify_cooldown_seconds": int(row["verify_cooldown_seconds"]),
            "default_firmware_id": row["default_firmware_id"],
        }

    def update_verify_cooldown_seconds(self, seconds: int) -> Dict[str, Any]:
        """更新防重复消耗间隔（秒）。0 表示关闭。"""
        if seconds < 0 or seconds > 365 * 24 * 3600:
            raise ValueError("verify_cooldown_seconds must be between 0 and 31536000")
        self.cur.execute(
            "UPDATE device_verification_settings SET verify_cooldown_seconds = ? WHERE id = 1",
            (int(seconds),),
        )
        self.conn.commit()
        return self.get_settings()

    def find_latest_log_by_device_id(self, device_id: str) -> Optional[Dict[str, Any]]:
        """该设备最近一次验证日志（按 issued_at 最新）。"""
        self.cur.execute(
            """
            SELECT issued_at, signature FROM device_verification_logs
            WHERE device_id = ?
            ORDER BY issued_at DESC, id DESC
            LIMIT 1
            """,
            (device_id,),
        )
        return row_to_dict(self.cur.fetchone())

    def _derive_key_from_device_id(self, device_id: str) -> bytes:
        import hashlib
        return hashlib.sha256(device_id.encode('utf-8')).digest()

    def _encrypt_key(self, key_bytes: bytes, device_id: str) -> str:
        aesgcm = AESGCM(self._derive_key_from_device_id(device_id))
        nonce = bytes(12)
        ciphertext = aesgcm.encrypt(nonce, key_bytes, None)
        return base64.b64encode(nonce + ciphertext).decode('ascii')

    def _decrypt_key(self, encrypted_key: str, device_id: str) -> bytes:
        aesgcm = AESGCM(self._derive_key_from_device_id(device_id))
        data = base64.b64decode(encrypted_key)
        nonce = data[:12]
        ciphertext = data[12:]
        return aesgcm.decrypt(nonce, ciphertext, None)

    def _generate_key_pair(self) -> tuple[bytes, bytes]:
        private_key = Ed25519PrivateKey.generate()
        private_bytes = private_key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption()
        )
        public_key = private_key.public_key()
        public_bytes = public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )
        return private_bytes, public_bytes

    def _load_private_key(self, private_bytes: bytes) -> Ed25519PrivateKey:
        return Ed25519PrivateKey.from_private_bytes(private_bytes)

    def _load_public_key(self, public_bytes: bytes) -> Ed25519PublicKey:
        return Ed25519PublicKey.from_public_bytes(public_bytes)

    def _canonical_message(self, device_id: str, issued_at: int) -> bytes:
        return f"{device_id}|{issued_at}".encode('utf-8')

    def _sign_payload(self, private_key: Ed25519PrivateKey, device_id: str, issued_at: int) -> str:
        signature = private_key.sign(self._canonical_message(device_id, issued_at))
        return base64.b64encode(signature).decode('ascii')

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT d.id, d.device_id, d.verification_count, d.max_verifications, d.is_whitelisted, d.question_id, d.firmware_id, d.public_key, d.created_at,
                   q.name as question_name, f.file_name as firmware_name, f.file_url as firmware_url
            FROM device_verifications d
            LEFT JOIN questions q ON d.question_id = q.id
            LEFT JOIN nano_firmware_files f ON d.firmware_id = f.id
            ORDER BY d.created_at DESC
            """
        )
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, device_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT d.id, d.device_id, d.verification_count, d.max_verifications, d.is_whitelisted, d.question_id, d.firmware_id, d.public_key, d.created_at,
                   q.name as question_name, f.file_name as firmware_name, f.file_url as firmware_url
            FROM device_verifications d
            LEFT JOIN questions q ON d.question_id = q.id
            LEFT JOIN nano_firmware_files f ON d.firmware_id = f.id
            WHERE d.id = ?
            """,
            (device_id,)
        )
        return row_to_dict(self.cur.fetchone())

    def find_by_device_id(self, device_id: str) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT d.*, q.name as question_name, f.file_name as firmware_name, f.file_url as firmware_url
            FROM device_verifications d
            LEFT JOIN questions q ON d.question_id = q.id
            LEFT JOIN nano_firmware_files f ON d.firmware_id = f.id
            WHERE d.device_id = ?
            """,
            (device_id,)
        )
        return row_to_dict(self.cur.fetchone())

    def create(
        self,
        device_id: str,
        max_verifications: int = 10,
        question_id: int = None,
        firmware_id: int = None,
        is_whitelisted: bool = False,
    ) -> Dict[str, Any]:
        if firmware_id is None:
            firmware_id = self.get_settings().get("default_firmware_id")
        private_bytes, public_bytes = self._generate_key_pair()
        encrypted_private = self._encrypt_key(private_bytes, device_id)
        encrypted_public = self._encrypt_key(public_bytes, device_id)
        
        self.cur.execute(
            """
            INSERT INTO device_verifications (device_id, verification_count, max_verifications, is_whitelisted, private_key, public_key, question_id, firmware_id)
            VALUES (?, 0, ?, ?, ?, ?, ?, ?)
            """,
            (device_id, max_verifications, 1 if is_whitelisted else 0, encrypted_private, encrypted_public, question_id, firmware_id)
        )
        self.conn.commit()
        
        return {
            "id": self.cur.lastrowid,
            "device_id": device_id,
            "verification_count": 0,
            "max_verifications": max_verifications,
            "is_whitelisted": 1 if is_whitelisted else 0,
            "question_id": question_id,
            "firmware_id": firmware_id,
            "public_key": encrypted_public
        }

    def update_max_verifications(self, device_id: str, max_verifications: int) -> None:
        self.cur.execute(
            "UPDATE device_verifications SET max_verifications = ? WHERE device_id = ?",
            (max_verifications, device_id)
        )
        self.conn.commit()

    def update_question_id(self, device_id: str, question_id: int) -> None:
        self.cur.execute(
            "UPDATE device_verifications SET question_id = ? WHERE device_id = ?",
            (question_id, device_id)
        )
        self.conn.commit()

    def update_firmware_id(self, device_id: str, firmware_id: int) -> None:
        self.cur.execute(
            "UPDATE device_verifications SET firmware_id = ? WHERE device_id = ?",
            (firmware_id, device_id)
        )
        self.conn.commit()

    def update_whitelist(self, device_id: str, is_whitelisted: bool) -> None:
        self.cur.execute(
            "UPDATE device_verifications SET is_whitelisted = ? WHERE device_id = ?",
            (1 if is_whitelisted else 0, device_id),
        )
        self.conn.commit()

    def cleanup_unwhitelisted_expired(self, ttl_minutes: int = 30) -> int:
        """删除创建超过 ttl_minutes 仍未授权的设备记录。"""
        ttl = int(ttl_minutes)
        if ttl <= 0:
            return 0
        self.cur.execute(
            """
            SELECT device_id
            FROM device_verifications
            WHERE COALESCE(is_whitelisted, 0) = 0
              AND datetime(created_at) <= datetime('now', ?)
            """,
            (f"-{ttl} minutes",),
        )
        rows = self.cur.fetchall()
        if not rows:
            return 0
        device_ids = [row["device_id"] for row in rows]
        for device_id in device_ids:
            self.cur.execute("DELETE FROM device_verification_logs WHERE device_id = ?", (device_id,))
            self.cur.execute("DELETE FROM device_verifications WHERE device_id = ?", (device_id,))
        self.conn.commit()
        return len(device_ids)

    def add_max_verifications(self, device_id: str, add_count: int) -> int:
        row = self.find_by_device_id(device_id)
        if row is None:
            raise ValueError("Device not found")
        new_max = row["max_verifications"] + add_count
        self.update_max_verifications(device_id, new_max)
        return new_max

    def delete(self, device_id: str) -> None:
        self.cur.execute("DELETE FROM device_verification_logs WHERE device_id = ?", (device_id,))
        self.cur.execute("DELETE FROM device_verifications WHERE device_id = ?", (device_id,))
        self.conn.commit()

    def verify_device(self, device_id: str, ip_address: str = None, user_agent: str = None) -> Dict[str, Any]:
        # 检查是否在禁用时间段内
        is_disabled, reason = self._is_verification_disabled()
        if is_disabled:
             raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=reason,
            )
        
        row = self.find_by_device_id(device_id)

        if row is None:
            default_max = 10
            self.create(device_id, default_max, is_whitelisted=False)
            row = self.find_by_device_id(device_id)

        if int(row.get("is_whitelisted") or 0) != 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device not whitelisted; contact administrator.",
            )

        count = row["verification_count"]
        max_v = row["max_verifications"]

        if count >= max_v:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Verification quota exhausted; contact administrator.",
            )

        # 冷却时间内重复请求：不增加次数、不写新日志，直接返回上次签名
        cooldown = int(self.get_settings()["verify_cooldown_seconds"])
        if cooldown > 0:
            latest = self.find_latest_log_by_device_id(device_id)
            if latest:
                now_ts = int(time.time())
                issued_prev = int(latest["issued_at"])
                if now_ts - issued_prev < cooldown:
                    public_bytes = self._decrypt_key(row["public_key"], device_id)
                    public_key = base64.b64encode(public_bytes).decode("ascii")
                    return {
                        "device_id": device_id,
                        "issued_at": issued_prev,
                        "signature": latest["signature"],
                        "public_key": public_key,
                    }

        issued_at = int(time.time())
        
        private_bytes = self._decrypt_key(row["private_key"], device_id)
        public_bytes = self._decrypt_key(row["public_key"], device_id)
        public_key = base64.b64encode(public_bytes).decode('ascii')
        private_key = self._load_private_key(private_bytes)
        
        signature = self._sign_payload(private_key, device_id, issued_at)
        
        self.cur.execute(
            "UPDATE device_verifications SET verification_count = verification_count + 1 WHERE device_id = ?",
            (device_id,)
        )
        
        self.cur.execute(
            """
            INSERT INTO device_verification_logs (device_id, issued_at, signature, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?)
            """,
            (device_id, issued_at, signature, ip_address, user_agent)
        )
        
        self.conn.commit()
        
        return {
            "device_id": device_id,
            "issued_at": issued_at,
            "signature": signature,
            "public_key": public_key
        }

    def reset_verification_count(self, device_id: str) -> None:
        self.cur.execute(
            "UPDATE device_verifications SET verification_count = 0 WHERE device_id = ?",
            (device_id,)
        )
        self.conn.commit()

    def get_public_key(self, device_id: str) -> Optional[str]:
        row = self.find_by_device_id(device_id)
        if row is None:
            return None
        public_bytes = self._decrypt_key(row["public_key"], device_id)
        return base64.b64encode(public_bytes).decode('ascii')

    def get_private_key(self, device_id: str) -> Optional[str]:
        row = self.find_by_device_id(device_id)
        if row is None:
            return None
        private_bytes = self._decrypt_key(row["private_key"], device_id)
        return base64.b64encode(private_bytes).decode('ascii')

    def get_keys(self, device_id: str) -> Optional[Dict[str, str]]:
        row = self.find_by_device_id(device_id)
        if row is None:
            return None
        private_bytes = self._decrypt_key(row["private_key"], device_id)
        public_bytes = self._decrypt_key(row["public_key"], device_id)
        return {
            "public_key": base64.b64encode(public_bytes).decode('ascii'),
            "private_key": base64.b64encode(private_bytes).decode('ascii')
        }

    def verify_signature(self, device_id: str, signature: str, issued_at: int) -> bool:
        row = self.find_by_device_id(device_id)
        if row is None:
            return False
        if int(row.get("is_whitelisted") or 0) != 1:
            return False
        try:
            public_bytes = self._decrypt_key(row["public_key"], device_id)
            public_key = self._load_public_key(public_bytes)
            signature_bytes = base64.b64decode(signature)
            public_key.verify(signature_bytes, self._canonical_message(device_id, issued_at))
            return True
        except Exception:
            return False

    def find_logs_by_device_id(self, device_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT id, device_id, issued_at, signature, ip_address, user_agent, created_at
            FROM device_verification_logs
            WHERE device_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (device_id, limit, offset)
        )
        return rows_to_dict(self.cur.fetchall())

    def count_logs_by_device_id(self, device_id: str) -> int:
        self.cur.execute(
            "SELECT COUNT(*) as count FROM device_verification_logs WHERE device_id = ?",
            (device_id,)
        )
        row = self.cur.fetchone()
        return row["count"] if row else 0

    def find_all_logs(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT id, device_id, issued_at, signature, ip_address, user_agent, created_at
            FROM device_verification_logs
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset)
        )
        return rows_to_dict(self.cur.fetchall())

    def count_all_logs(self) -> int:
        self.cur.execute("SELECT COUNT(*) as count FROM device_verification_logs")
        row = self.cur.fetchone()
        return row["count"] if row else 0

    def delete_logs_by_device_id(self, device_id: str) -> None:
        self.cur.execute("DELETE FROM device_verification_logs WHERE device_id = ?", (device_id,))
        self.conn.commit()

    def list_firmware_files(self) -> List[Dict[str, Any]]:
        settings = self.get_settings()
        default_id = settings.get("default_firmware_id")
        self.cur.execute(
            """
            SELECT id, file_name, file_url, file_size, created_at
            FROM nano_firmware_files
            ORDER BY created_at DESC, id DESC
            """
        )
        rows = rows_to_dict(self.cur.fetchall())
        for row in rows:
            row["is_default"] = row.get("id") == default_id
        return rows

    def create_firmware_file(self, file_name: str, file_url: str, file_size: int = 0) -> Dict[str, Any]:
        self.cur.execute(
            """
            INSERT INTO nano_firmware_files (file_name, file_url, file_size)
            VALUES (?, ?, ?)
            """,
            (file_name, file_url, int(file_size or 0)),
        )
        firmware_id = self.cur.lastrowid
        self.conn.commit()
        self.cur.execute(
            "SELECT id, file_name, file_url, file_size, created_at FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if row:
            row["is_default"] = row.get("id") == self.get_settings().get("default_firmware_id")
        return row

    def delete_firmware_file(self, firmware_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT id, file_name, file_url, file_size, created_at FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if not row:
            return None
        self.cur.execute("DELETE FROM nano_firmware_files WHERE id = ?", (firmware_id,))
        self.cur.execute("UPDATE device_verifications SET firmware_id = NULL WHERE firmware_id = ?", (firmware_id,))
        self.cur.execute(
            "UPDATE device_verification_settings SET default_firmware_id = NULL WHERE id = 1 AND default_firmware_id = ?",
            (firmware_id,),
        )
        self.conn.commit()
        row["is_default"] = False
        return row

    def set_default_firmware(self, firmware_id: int) -> Dict[str, Any]:
        self.cur.execute(
            "SELECT id, file_name, file_url, file_size, created_at FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if not row:
            raise ValueError("Firmware not found")
        self.cur.execute(
            "UPDATE device_verification_settings SET default_firmware_id = ? WHERE id = 1",
            (firmware_id,),
        )
        self.cur.execute(
            "UPDATE device_verifications SET firmware_id = ?",
            (firmware_id,),
        )
        self.conn.commit()
        row["is_default"] = True
        return row