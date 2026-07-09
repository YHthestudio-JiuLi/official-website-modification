from __future__ import annotations

import logging
import time
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict
from .device_verification_crypto import PlatformSigningCrypto
from .device_verification_firmware import DeviceFirmwareStore
from .device_verification_fingerprint import (
    assert_algo_version,
    assert_binding_row_integrity,
    assert_enabled,
    assert_quota,
    normalize_fingerprint,
    normalize_fingerprint_algo_version,
    require_fingerprint,
)
from .device_verification_errors import (
    DeviceVerificationError,
    DEVICE_NOT_FOUND,
    FINGERPRINT_ALREADY_ENROLLED,
    FINGERPRINT_NOT_ENROLLED,
    FINGERPRINT_REQUIRED,
    INVALID_COOLDOWN,
    INVALID_FINGERPRINT,
    INVALID_MAX_VERIFICATIONS,
    INVALID_SIGNING_KEY,
    SIGNATURE_INVALID,
    FINGERPRINT_ALGO_VERSION,
)


class DeviceVerificationManager:
    FINGERPRINT_ALGO_VERSION = FINGERPRINT_ALGO_VERSION

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()
        self._crypto = PlatformSigningCrypto(self._read_signing_key_encrypted)
        self._firmware = DeviceFirmwareStore(self.conn, self.cur, self.get_settings)

    @property
    def firmware(self) -> DeviceFirmwareStore:
        """固件库 CRUD（RPC 经 main.py 访问此属性）。"""
        return self._firmware

    def create_table(self) -> None:
        from ..db import add_column_if_missing, drop_column_if_exists
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS device_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_id VARCHAR(255) UNIQUE NOT NULL,
                verification_count INT NOT NULL DEFAULT 0,
                max_verifications INT NOT NULL DEFAULT 10,
                is_whitelisted TINYINT NOT NULL DEFAULT 0,
                question_id INT,
                firmware_id INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                KEY idx_device_verifications_device_id (device_id),
                KEY idx_device_verifications_question_id (question_id),
                KEY idx_device_verifications_firmware_id (firmware_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        # 已有库升级兼容
        add_column_if_missing(self.conn, "device_verifications", "question_id", "INT")
        add_column_if_missing(self.conn, "device_verifications", "firmware_id", "INT")
        add_column_if_missing(self.conn, "device_verifications", "is_whitelisted", "TINYINT NOT NULL DEFAULT 0")
        add_column_if_missing(self.conn, "device_verifications", "device_fingerprint", "VARCHAR(128)")
        add_column_if_missing(self.conn, "device_verifications", "fingerprint_algo_version", "VARCHAR(16)")
        add_column_if_missing(self.conn, "device_verifications", "fingerprint_verified_at", "DATETIME")
        add_column_if_missing(self.conn, "device_verifications", "created_by_user_id", "INT")
        # 平台级签名已取代每设备密钥列，迁移后删除遗留列
        drop_column_if_exists(self.conn, "device_verifications", "private_key")
        drop_column_if_exists(self.conn, "device_verifications", "public_key")
        self._ensure_unique_fingerprint_index()
        self.cur.execute(
            """
            UPDATE device_verifications
            SET fingerprint_algo_version = ?
            WHERE fingerprint_algo_version IS NULL OR TRIM(fingerprint_algo_version) = ''
            """,
            (self.FINGERPRINT_ALGO_VERSION,),
        )
        self.conn.commit()

        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS device_verification_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_id VARCHAR(255) NOT NULL,
                issued_at BIGINT NOT NULL,
                signature TEXT NOT NULL,
                ip_address VARCHAR(64),
                user_agent VARCHAR(512),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                KEY idx_device_verification_logs_device_id (device_id),
                KEY idx_device_verification_logs_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        add_column_if_missing(self.conn, "device_verification_logs", "count_applied", "TINYINT NOT NULL DEFAULT 0")
        # 全局策略：同一 device_id 在 N 秒内重复调用 /verify 不增加 verification_count（返回最近一次签名）
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS device_verification_settings (
                id INT PRIMARY KEY,
                verify_cooldown_seconds INT NOT NULL DEFAULT 0,
                default_firmware_id INT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        add_column_if_missing(self.conn, "device_verification_settings", "default_firmware_id", "INT")
        add_column_if_missing(self.conn, "device_verification_settings", "signing_private_key_encrypted", "TEXT")
        add_column_if_missing(self.conn, "device_verification_settings", "signing_public_key_b64", "VARCHAR(64)")
        self.conn.execute(
            "INSERT IGNORE INTO device_verification_settings (id, verify_cooldown_seconds) VALUES (1, 0)"
        )
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS nano_firmware_files (
                id INT AUTO_INCREMENT PRIMARY KEY,
                file_name VARCHAR(255) NOT NULL,
                file_url VARCHAR(500) NOT NULL UNIQUE,
                file_size BIGINT NOT NULL DEFAULT 0,
                checksum_sha256 VARCHAR(64),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                KEY idx_nano_firmware_files_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        add_column_if_missing(self.conn, "nano_firmware_files", "checksum_sha256", "VARCHAR(64)")
        add_column_if_missing(self.conn, "nano_firmware_files", "remark", "VARCHAR(500)")
        add_column_if_missing(self.conn, "nano_firmware_files", "created_by_user_id", "INT")

    def get_settings(self) -> Dict[str, Any]:
        """读取设备验证全局设置（单行）。"""
        self.cur.execute(
            """
            SELECT verify_cooldown_seconds, default_firmware_id,
                   signing_private_key_encrypted, signing_public_key_b64
            FROM device_verification_settings WHERE id = 1
            """
        )
        row = self.cur.fetchone()
        if row is None:
            return {
                "verify_cooldown_seconds": 0,
                "default_firmware_id": None,
                "signing_key_configured": False,
                "signing_public_key_b64": None,
            }
        signing_configured = bool(str(row.get("signing_private_key_encrypted") or "").strip())
        public_b64 = str(row.get("signing_public_key_b64") or "").strip() or None
        return {
            "verify_cooldown_seconds": int(row["verify_cooldown_seconds"]),
            "default_firmware_id": row["default_firmware_id"],
            "signing_key_configured": signing_configured,
            "signing_public_key_b64": public_b64,
        }

    def update_settings(
        self,
        verify_cooldown_seconds: Optional[int] = None,
        signing_private_key: Optional[str] = None,
        signing_private_key_b64: Optional[str] = None,
    ) -> Dict[str, Any]:
        """更新全局设置：冷却间隔、平台签名私钥（本机生成后上传）。"""
        try:
            if verify_cooldown_seconds is not None:
                if verify_cooldown_seconds < 0 or verify_cooldown_seconds > 365 * 24 * 3600:
                    raise DeviceVerificationError(INVALID_COOLDOWN)
                self.cur.execute(
                    "UPDATE device_verification_settings SET verify_cooldown_seconds = ? WHERE id = 1",
                    (int(verify_cooldown_seconds),),
                )

            private_key_input = signing_private_key if signing_private_key is not None else signing_private_key_b64
            if private_key_input is not None:
                raw = private_key_input.strip()
                if raw == "":
                    raise DeviceVerificationError(INVALID_SIGNING_KEY, "signing_private_key cannot be empty")
                private_bytes = self._crypto.parse_ed25519_private_key(raw)
                encrypted = self._crypto.encrypt_platform_secret(private_bytes)
                public_b64 = PlatformSigningCrypto.public_key_b64_from_private_bytes(private_bytes)
                self.cur.execute(
                    """
                    UPDATE device_verification_settings
                    SET signing_private_key_encrypted = ?, signing_public_key_b64 = ?
                    WHERE id = 1
                    """,
                    (encrypted, public_b64),
                )

            self.conn.commit()
            return self.get_settings()
        except DeviceVerificationError:
            raise
        except ValueError as exc:
            raise DeviceVerificationError(INVALID_SIGNING_KEY, str(exc), 400) from exc

    def update_verify_cooldown_seconds(self, seconds: int) -> Dict[str, Any]:
        """更新防重复消耗间隔（秒）。0 表示关闭。"""
        return self.update_settings(verify_cooldown_seconds=seconds)

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

    def _ensure_unique_fingerprint_index(self) -> None:
        """确保 device_fingerprint 唯一索引存在；历史重复数据时记录告警并跳过。"""
        logger = logging.getLogger("py_backend")
        self.cur.execute(
            """
            SELECT device_fingerprint, COUNT(*) AS cnt
            FROM device_verifications
            WHERE device_fingerprint IS NOT NULL AND TRIM(device_fingerprint) != ''
            GROUP BY device_fingerprint
            HAVING cnt > 1
            """
        )
        duplicate_rows = self.cur.fetchall()
        if duplicate_rows:
            logger.error(
                "存在重复 device_fingerprint，无法创建唯一索引；请管理员清理重复设备后重启服务",
                extra={"extra_data": {"duplicate_fingerprint_groups": len(duplicate_rows)}},
            )
            return

        try:
            self.cur.execute(
                "CREATE UNIQUE INDEX idx_device_verifications_fingerprint ON device_verifications (device_fingerprint)"
            )
            self.conn.commit()
        except Exception as exc:
            message = str(exc).lower()
            if "duplicate key name" in message or "already exists" in message:
                return
            logger.error(
                "创建指纹唯一索引失败",
                extra={"extra_data": {"error": str(exc)}},
            )
            raise

    def _read_signing_key_encrypted(self) -> str:
        self.cur.execute(
            "SELECT signing_private_key_encrypted FROM device_verification_settings WHERE id = 1"
        )
        row = self.cur.fetchone()
        return str((row or {}).get("signing_private_key_encrypted") or "")

    def find_all(self, created_by_user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        sql = """
            SELECT d.id, d.device_id, d.verification_count, d.max_verifications, d.is_whitelisted, d.question_id, d.firmware_id,
                   d.device_fingerprint, d.fingerprint_algo_version, d.fingerprint_verified_at, d.created_at, d.created_by_user_id,
                   q.name as question_name, f.file_name as firmware_name, f.file_url as firmware_url, f.checksum_sha256 as firmware_checksum_sha256
            FROM device_verifications d
            LEFT JOIN questions q ON d.question_id = q.id
            LEFT JOIN nano_firmware_files f ON d.firmware_id = f.id
        """
        params: tuple = ()
        if created_by_user_id is not None:
            sql += " WHERE d.created_by_user_id = ?"
            params = (created_by_user_id,)
        sql += " ORDER BY d.created_at DESC"
        self.cur.execute(sql, params)
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, device_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT d.id, d.device_id, d.verification_count, d.max_verifications, d.is_whitelisted, d.question_id, d.firmware_id,
                   d.device_fingerprint, d.fingerprint_algo_version, d.fingerprint_verified_at, d.created_at, d.created_by_user_id,
                   q.name as question_name, f.file_name as firmware_name, f.file_url as firmware_url, f.checksum_sha256 as firmware_checksum_sha256
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
            SELECT d.*, q.name as question_name, f.file_name as firmware_name, f.file_url as firmware_url,
                   f.checksum_sha256 as firmware_checksum_sha256, f.file_size as firmware_file_size
            FROM device_verifications d
            LEFT JOIN questions q ON d.question_id = q.id
            LEFT JOIN nano_firmware_files f ON d.firmware_id = f.id
            WHERE d.device_id = ?
            """,
            (device_id,)
        )
        return row_to_dict(self.cur.fetchone())

    def find_by_fingerprint(self, fingerprint: str) -> Optional[Dict[str, Any]]:
        """按预置设备指纹查找设备（验证与下载鉴权的主键）。"""
        normalized = normalize_fingerprint(fingerprint)
        if not normalized:
            return None
        self.cur.execute(
            """
            SELECT d.*, q.name as question_name, f.file_name as firmware_name, f.file_url as firmware_url,
                   f.checksum_sha256 as firmware_checksum_sha256, f.file_size as firmware_file_size
            FROM device_verifications d
            LEFT JOIN questions q ON d.question_id = q.id
            LEFT JOIN nano_firmware_files f ON d.firmware_id = f.id
            WHERE d.device_fingerprint = ?
            LIMIT 1
            """,
            (normalized,),
        )
        return row_to_dict(self.cur.fetchone())

    def create(
        self,
        device_id: str,
        max_verifications: int = 10,
        question_id: int = None,
        firmware_id: int = None,
        is_whitelisted: bool = False,
        device_fingerprint: str = None,
        fingerprint_algo_version: str = None,
        created_by_user_id: int = None,
    ) -> Dict[str, Any]:
        if firmware_id is None:
            firmware_id = self.get_settings().get("default_firmware_id")
        normalized_fingerprint = normalize_fingerprint(device_fingerprint)
        if not normalized_fingerprint:
            raise DeviceVerificationError(FINGERPRINT_REQUIRED)
        normalized_algo_version = normalize_fingerprint_algo_version(fingerprint_algo_version)

        existing = self.find_by_fingerprint(normalized_fingerprint)
        if existing:
            # 无归属设备：允许当前创建者认领（代理此前创建成功但未记录归属时）
            if created_by_user_id and not existing.get("created_by_user_id"):
                self.cur.execute(
                    "UPDATE device_verifications SET created_by_user_id = ? WHERE id = ?",
                    (created_by_user_id, existing["id"]),
                )
                self.conn.commit()
                row = self.find_by_device_id(existing["device_id"])
                return {
                    "id": row["id"],
                    "device_id": row["device_id"],
                    "verification_count": row["verification_count"],
                    "max_verifications": row["max_verifications"],
                    "is_whitelisted": row.get("is_whitelisted", 0),
                    "question_id": row.get("question_id"),
                    "firmware_id": row.get("firmware_id"),
                    "device_fingerprint": row.get("device_fingerprint"),
                    "fingerprint_algo_version": row.get("fingerprint_algo_version"),
                }
            raise DeviceVerificationError(FINGERPRINT_ALREADY_ENROLLED, http_status=400)

        self.cur.execute(
            """
            INSERT INTO device_verifications (
                device_id, verification_count, max_verifications, is_whitelisted, question_id, firmware_id,
                device_fingerprint, fingerprint_algo_version, fingerprint_verified_at, created_by_user_id
            )
            VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                device_id,
                max_verifications,
                1 if is_whitelisted else 0,
                question_id,
                firmware_id,
                normalized_fingerprint,
                normalized_algo_version,
                datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S") if is_whitelisted else None,
                created_by_user_id,
            ),
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
            "device_fingerprint": normalized_fingerprint,
            "fingerprint_algo_version": normalized_algo_version,
        }

    def patch_device(self, device_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """单事务更新设备字段（管理端 PATCH 入口）。"""
        row = self.find_by_device_id(device_id)
        if row is None:
            raise DeviceVerificationError(DEVICE_NOT_FOUND, http_status=404)

        has_existing_fingerprint = bool(str(row.get("device_fingerprint") or "").strip())
        if not has_existing_fingerprint and "device_fingerprint" not in payload:
            raise DeviceVerificationError(FINGERPRINT_REQUIRED)

        new_max = int(row["max_verifications"])
        if "max_verifications" in payload:
            new_max = int(payload["max_verifications"])
        if "add_max_verifications" in payload:
            new_max += int(payload["add_max_verifications"])
        if new_max < 0 or new_max > 1000000:
            raise DeviceVerificationError(INVALID_MAX_VERIFICATIONS)

        self.cur.execute(
            "UPDATE device_verifications SET max_verifications = ? WHERE device_id = ?",
            (new_max, device_id),
        )

        if "question_id" in payload:
            qid = int(payload["question_id"]) if payload["question_id"] not in (None, "") else None
            self.cur.execute(
                "UPDATE device_verifications SET question_id = ? WHERE device_id = ?",
                (qid, device_id),
            )

        if "firmware_id" in payload:
            fid = int(payload["firmware_id"]) if payload["firmware_id"] not in (None, "") else None
            self.cur.execute(
                "UPDATE device_verifications SET firmware_id = ? WHERE device_id = ?",
                (fid, device_id),
            )

        if "is_whitelisted" in payload:
            enabled = bool(payload["is_whitelisted"])
            self.cur.execute(
                """
                UPDATE device_verifications
                SET is_whitelisted = ?,
                    fingerprint_verified_at = CASE WHEN ? = 1 THEN UTC_TIMESTAMP() ELSE NULL END
                WHERE device_id = ?
                """,
                (1 if enabled else 0, 1 if enabled else 0, device_id),
            )

        if "device_fingerprint" in payload or "fingerprint_algo_version" in payload:
            fp_raw = payload.get("device_fingerprint", row.get("device_fingerprint"))
            algo_raw = payload.get("fingerprint_algo_version", row.get("fingerprint_algo_version"))
            try:
                normalized_fingerprint = normalize_fingerprint(fp_raw)
            except ValueError as exc:
                raise DeviceVerificationError(INVALID_FINGERPRINT) from exc
            if not normalized_fingerprint:
                raise DeviceVerificationError(FINGERPRINT_REQUIRED)
            normalized_algo = normalize_fingerprint_algo_version(algo_raw)
            current_fp = normalize_fingerprint(row.get("device_fingerprint"))
            if normalized_fingerprint != current_fp:
                conflict = self.find_by_fingerprint(normalized_fingerprint)
                if conflict is not None and conflict.get("device_id") != device_id:
                    raise DeviceVerificationError(FINGERPRINT_ALREADY_ENROLLED, http_status=400)
            should_reset = normalized_fingerprint != current_fp
            self.cur.execute(
                """
                UPDATE device_verifications
                SET device_fingerprint = ?,
                    fingerprint_algo_version = ?,
                    is_whitelisted = CASE WHEN ? = 1 THEN 0 ELSE is_whitelisted END,
                    fingerprint_verified_at = CASE WHEN ? = 1 THEN NULL ELSE fingerprint_verified_at END
                WHERE device_id = ?
                """,
                (
                    normalized_fingerprint,
                    normalized_algo,
                    1 if should_reset else 0,
                    1 if should_reset else 0,
                    device_id,
                ),
            )

        self.conn.commit()
        latest = self.find_by_device_id(device_id) or {}
        return {
            "device_id": device_id,
            "max_verifications": int(latest.get("max_verifications") or new_max),
            "question_id": latest.get("question_id"),
            "firmware_id": latest.get("firmware_id"),
            "is_whitelisted": int(latest.get("is_whitelisted") or 0),
            "device_fingerprint": latest.get("device_fingerprint"),
            "fingerprint_algo_version": latest.get("fingerprint_algo_version"),
        }

    def delete(self, device_id: str) -> None:
        self.cur.execute("DELETE FROM device_verification_logs WHERE device_id = ?", (device_id,))
        self.cur.execute("DELETE FROM device_verifications WHERE device_id = ?", (device_id,))
        self.conn.commit()

    def authenticate_signed_request(
        self,
        fingerprint: str,
        signature: str,
        issued_at: int,
    ) -> Dict[str, Any]:
        """单次 DB 查询完成指纹绑定、启用状态与签名校验（下载/绑定查询鉴权）。"""
        normalized = require_fingerprint(fingerprint)
        row = self.find_by_fingerprint(normalized)
        if row is None:
            raise DeviceVerificationError(FINGERPRINT_NOT_ENROLLED)
        assert_binding_row_integrity(row)
        assert_enabled(row)
        if not self._crypto.verify_signature(normalized, signature, int(issued_at)):
            raise DeviceVerificationError(SIGNATURE_INVALID)
        return row

    def verify_device(
        self,
        fingerprint: str = None,
        fingerprint_algo_version: str = None,
        ip_address: str = None,
        user_agent: str = None,
    ) -> Dict[str, Any]:
        normalized_fingerprint = require_fingerprint(fingerprint)
        assert_algo_version(fingerprint_algo_version)

        row = self.find_by_fingerprint(normalized_fingerprint)
        if row is None:
            raise DeviceVerificationError(FINGERPRINT_NOT_ENROLLED)

        assert_binding_row_integrity(row)
        assert_enabled(row)
        assert_quota(row)

        enrolled_device_id = row["device_id"]

        # 冷却时间内重复请求：不增加次数、不写新日志，直接返回上次签名
        cooldown = int(self.get_settings()["verify_cooldown_seconds"])
        if cooldown > 0:
            latest = self.find_latest_log_by_device_id(enrolled_device_id)
            if latest:
                now_ts = int(time.time())
                issued_prev = int(latest["issued_at"])
                if now_ts - issued_prev < cooldown:
                    return {
                        "fingerprint": normalized_fingerprint,
                        "issued_at": issued_prev,
                        "signature": latest["signature"],
                    }

        issued_at = int(time.time())

        signature = self._crypto.sign_payload(normalized_fingerprint, issued_at)

        # 拉签仅签发与记日志；verification_count 在设备端本地验签通过后由 confirm_verification 扣减
        self.cur.execute(
            """
            INSERT INTO device_verification_logs (
                device_id, issued_at, signature, ip_address, user_agent, count_applied
            )
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (enrolled_device_id, issued_at, signature, ip_address, user_agent),
        )

        self.conn.commit()

        return {
            "fingerprint": normalized_fingerprint,
            "issued_at": issued_at,
            "signature": signature,
        }

    def confirm_verification(
        self,
        fingerprint: str,
        issued_at: int,
        signature: str,
    ) -> Dict[str, Any]:
        """设备端本地验签通过后调用：此时才扣减验证次数（幂等）。"""
        normalized = require_fingerprint(fingerprint)
        if not self._crypto.verify_signature(normalized, signature, int(issued_at)):
            raise DeviceVerificationError(SIGNATURE_INVALID)

        row = self.find_by_fingerprint(normalized)
        if row is None:
            raise DeviceVerificationError(FINGERPRINT_NOT_ENROLLED)
        assert_enabled(row)

        device_id = row["device_id"]
        self.cur.execute(
            """
            SELECT id, count_applied FROM device_verification_logs
            WHERE device_id = ? AND issued_at = ? AND signature = ?
            LIMIT 1
            """,
            (device_id, int(issued_at), signature),
        )
        log_row = row_to_dict(self.cur.fetchone())
        if log_row is None:
            raise DeviceVerificationError(SIGNATURE_INVALID, "Verification log not found for issued_at")

        if int(log_row.get("count_applied") or 0) == 1:
            return {
                "fingerprint": normalized,
                "issued_at": int(issued_at),
                "verification_count": int(row["verification_count"]),
                "already_counted": True,
            }

        assert_quota(row)

        self.cur.execute(
            "UPDATE device_verification_logs SET count_applied = 1 WHERE id = ?",
            (log_row["id"],),
        )
        self.cur.execute(
            "UPDATE device_verifications SET verification_count = verification_count + 1 WHERE device_id = ?",
            (device_id,),
        )
        self.conn.commit()

        updated = self.find_by_device_id(device_id) or row
        return {
            "fingerprint": normalized,
            "issued_at": int(issued_at),
            "verification_count": int(updated["verification_count"]),
            "already_counted": False,
        }

    def reset_verification_count(self, device_id: str) -> None:
        self.cur.execute(
            "UPDATE device_verifications SET verification_count = 0 WHERE device_id = ?",
            (device_id,)
        )
        self.conn.commit()

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

