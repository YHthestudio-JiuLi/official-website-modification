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
                private_key TEXT NOT NULL,
                public_key TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_device_verifications_device_id ON device_verifications(device_id)"
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
                verify_cooldown_seconds INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        self.conn.execute(
            "INSERT OR IGNORE INTO device_verification_settings (id, verify_cooldown_seconds) VALUES (1, 0)"
        )

    def get_settings(self) -> Dict[str, Any]:
        """读取设备验证全局设置（单行）。"""
        self.cur.execute(
            "SELECT verify_cooldown_seconds FROM device_verification_settings WHERE id = 1"
        )
        row = self.cur.fetchone()
        if row is None:
            return {"verify_cooldown_seconds": 0}
        return {"verify_cooldown_seconds": int(row["verify_cooldown_seconds"])}

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
            "SELECT id, device_id, verification_count, max_verifications, public_key, created_at FROM device_verifications ORDER BY created_at DESC"
        )
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, device_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT id, device_id, verification_count, max_verifications, public_key, created_at FROM device_verifications WHERE id = ?",
            (device_id,)
        )
        return row_to_dict(self.cur.fetchone())

    def find_by_device_id(self, device_id: str) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT * FROM device_verifications WHERE device_id = ?",
            (device_id,)
        )
        return row_to_dict(self.cur.fetchone())

    def create(self, device_id: str, max_verifications: int = 10) -> Dict[str, Any]:
        private_bytes, public_bytes = self._generate_key_pair()
        encrypted_private = self._encrypt_key(private_bytes, device_id)
        encrypted_public = self._encrypt_key(public_bytes, device_id)
        
        self.cur.execute(
            """
            INSERT INTO device_verifications (device_id, verification_count, max_verifications, private_key, public_key)
            VALUES (?, 0, ?, ?, ?)
            """,
            (device_id, max_verifications, encrypted_private, encrypted_public)
        )
        self.conn.commit()
        
        return {
            "id": self.cur.lastrowid,
            "device_id": device_id,
            "verification_count": 0,
            "max_verifications": max_verifications,
            "public_key": encrypted_public
        }

    def update_max_verifications(self, device_id: str, max_verifications: int) -> None:
        self.cur.execute(
            "UPDATE device_verifications SET max_verifications = ? WHERE device_id = ?",
            (max_verifications, device_id)
        )
        self.conn.commit()

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
            self.create(device_id, default_max)
            row = self.find_by_device_id(device_id)

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