from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict


class QuestionManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              category_name VARCHAR(255),
              db_file_path VARCHAR(500),
              vector_file_path VARCHAR(500),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_questions_category_name (category_name),
              KEY idx_questions_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        from ..db import add_column_if_missing
        add_column_if_missing(self.conn, "questions", "category_name", "VARCHAR(255)")
        add_column_if_missing(self.conn, "questions", "created_by_user_id", "INT")

    def find_all(self, created_by_user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM questions"
        params: tuple = ()
        if created_by_user_id is not None:
            sql += " WHERE created_by_user_id = ?"
            params = (created_by_user_id,)
        sql += " ORDER BY created_at DESC, id DESC"
        self.cur.execute(sql, params)
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, question_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
        return row_to_dict(self.cur.fetchone())

    def create(
        self,
        name: str,
        category_name: Optional[str] = None,
        db_file_path: Optional[str] = None,
        vector_file_path: Optional[str] = None,
        created_by_user_id: Optional[int] = None,
    ) -> int:
        self.cur.execute(
            "INSERT INTO questions (name, category_name, db_file_path, vector_file_path, created_by_user_id) VALUES (?, ?, ?, ?, ?)",
            (name, category_name, db_file_path, vector_file_path, created_by_user_id),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update(
        self,
        question_id: int,
        name: str,
        category_name: Optional[str] = None,
        db_file_path: Optional[str] = None,
        vector_file_path: Optional[str] = None,
    ) -> None:
        self.cur.execute(
            "UPDATE questions SET name = ?, category_name = ?, db_file_path = ?, vector_file_path = ? WHERE id = ?",
            (name, category_name, db_file_path, vector_file_path, question_id),
        )
        self.conn.commit()

    def update_fields(
        self,
        question_id: int,
        name: Optional[str] = None,
        category_name: Optional[str] = None,
        db_file_path: Optional[str] = None,
        vector_file_path: Optional[str] = None,
    ) -> None:
        updates = []
        params = []
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if category_name is not None:
            updates.append("category_name = ?")
            params.append(category_name)
        if db_file_path is not None:
            updates.append("db_file_path = ?")
            params.append(db_file_path)
        if vector_file_path is not None:
            updates.append("vector_file_path = ?")
            params.append(vector_file_path)
        if updates:
            params.append(question_id)
            sql = f"UPDATE questions SET {', '.join(updates)} WHERE id = ?"
            self.cur.execute(sql, params)
            self.conn.commit()

    def unlink_devices(self, question_id: int) -> None:
        """删除题库前解除设备绑定"""
        self.cur.execute(
            "UPDATE device_verifications SET question_id = NULL WHERE question_id = ?",
            (question_id,),
        )
        self.conn.commit()

    def delete_row(self, question_id: int) -> None:
        """仅删除数据库记录（调用方负责清理上传目录）"""
        self.cur.execute("DELETE FROM questions WHERE id = ?", (question_id,))
        self.conn.commit()

    def delete(self, question_id: int) -> None:
        self.unlink_devices(question_id)
        self.delete_row(question_id)