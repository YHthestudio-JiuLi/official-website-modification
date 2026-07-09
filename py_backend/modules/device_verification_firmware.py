"""Nano 固件文件库表 CRUD。"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from ..upload_cleanup import delete_firmware_upload_file
from ..utils import row_to_dict, rows_to_dict
from .device_verification_errors import DEVICE_NOT_FOUND, DeviceVerificationError


class DeviceFirmwareStore:
    """固件元数据与默认固件设置。"""

    _COLUMNS = "id, file_name, file_url, file_size, checksum_sha256, remark, created_at, created_by_user_id"

    def __init__(self, conn, cur, get_settings: Callable[[], Dict[str, Any]]) -> None:
        self.conn = conn
        self.cur = cur
        self.get_settings = get_settings

    def find_firmware_by_id(self, firmware_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            f"SELECT {self._COLUMNS} FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if row:
            row["is_default"] = row.get("id") == self.get_settings().get("default_firmware_id")
        return row

    def list_firmware_files(self, created_by_user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        default_id = self.get_settings().get("default_firmware_id")
        sql = f"SELECT {self._COLUMNS} FROM nano_firmware_files"
        params: tuple = ()
        if created_by_user_id is not None:
            sql += " WHERE created_by_user_id = ?"
            params = (created_by_user_id,)
        sql += " ORDER BY created_at DESC, id DESC"
        self.cur.execute(sql, params)
        rows = rows_to_dict(self.cur.fetchall())
        for row in rows:
            row["is_default"] = row.get("id") == default_id
        return rows

    def create_firmware_file(
        self,
        file_name: str,
        file_url: str,
        file_size: int = 0,
        checksum_sha256: str = None,
        remark: str = None,
        created_by_user_id: int = None,
    ) -> Dict[str, Any]:
        normalized_checksum = (checksum_sha256 or "").strip().lower() or None
        if normalized_checksum is not None and (
            len(normalized_checksum) != 64
            or any(ch not in "0123456789abcdef" for ch in normalized_checksum)
        ):
            raise ValueError("checksum_sha256 must be a 64-char hex string")
        normalized_remark = (remark or "").strip()[:500] or None
        self.cur.execute(
            """
            INSERT INTO nano_firmware_files (file_name, file_url, file_size, checksum_sha256, remark, created_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (file_name, file_url, int(file_size or 0), normalized_checksum, normalized_remark, created_by_user_id),
        )
        firmware_id = self.cur.lastrowid
        self.conn.commit()
        self.cur.execute(
            f"SELECT {self._COLUMNS} FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if row:
            row["is_default"] = row.get("id") == self.get_settings().get("default_firmware_id")
        return row

    def delete_firmware_file(self, firmware_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            f"SELECT {self._COLUMNS} FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if not row:
            return None
        delete_firmware_upload_file(row.get("file_url"))
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
            f"SELECT {self._COLUMNS} FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if not row:
            raise DeviceVerificationError(DEVICE_NOT_FOUND, http_status=404)
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

    def update_firmware_remark(self, firmware_id: int, remark: str = None) -> Dict[str, Any]:
        normalized_remark = (remark or "").strip()[:500] or None
        self.cur.execute(
            f"SELECT {self._COLUMNS} FROM nano_firmware_files WHERE id = ?",
            (firmware_id,),
        )
        row = row_to_dict(self.cur.fetchone())
        if not row:
            raise DeviceVerificationError(DEVICE_NOT_FOUND, http_status=404)
        self.cur.execute(
            "UPDATE nano_firmware_files SET remark = ? WHERE id = ?",
            (normalized_remark, firmware_id),
        )
        self.conn.commit()
        row["remark"] = normalized_remark
        row["is_default"] = row.get("id") == self.get_settings().get("default_firmware_id")
        return row
