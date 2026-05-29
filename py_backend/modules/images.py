from __future__ import annotations

import base64
from typing import Any, Dict, Optional


class ImageManager:
    """产品等图片以 BLOB 形式存储于 MySQL，通过 /api/product-images/<id> 读取。"""

    def __init__(self, conn) -> None:
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS images (
              id INT AUTO_INCREMENT PRIMARY KEY,
              filename VARCHAR(255),
              mime VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
              data LONGBLOB NOT NULL,
              size INT NOT NULL DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def create(self, data_base64: str, mime: str = "application/octet-stream", filename: Optional[str] = None) -> int:
        """传入 base64 字符串（Node 上传时编码），落库为二进制。返回图片 id。"""
        raw = base64.b64decode(data_base64 or "")
        self.cur.execute(
            "INSERT INTO images (filename, mime, data, size) VALUES (?, ?, ?, ?)",
            (filename, mime or "application/octet-stream", raw, len(raw)),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def get(self, image_id: int) -> Optional[Dict[str, Any]]:
        """返回 {mime, filename, dataBase64}，供 Node 解码后流式输出。"""
        self.cur.execute(
            "SELECT id, filename, mime, data FROM images WHERE id = ?",
            (int(image_id),),
        )
        row = self.cur.fetchone()
        if not row:
            return None
        data = row.get("data") or b""
        if isinstance(data, str):
            data = data.encode("utf-8", errors="ignore")
        return {
            "id": row["id"],
            "filename": row.get("filename"),
            "mime": row.get("mime") or "application/octet-stream",
            "dataBase64": base64.b64encode(data).decode("ascii"),
        }

    def delete(self, image_id: int) -> None:
        self.cur.execute("DELETE FROM images WHERE id = ?", (int(image_id),))
        self.conn.commit()
