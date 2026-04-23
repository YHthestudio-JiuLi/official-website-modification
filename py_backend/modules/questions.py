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
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              category_name TEXT,
              db_file_path TEXT,
              vector_file_path TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.cur.execute("PRAGMA table_info(questions)")
        columns = [col[1] for col in self.cur.fetchall()]
        if "category_name" not in columns:
            self.conn.execute("ALTER TABLE questions ADD COLUMN category_name TEXT")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_questions_category_name ON questions(category_name)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions(created_at)")

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM questions ORDER BY created_at DESC, id DESC")
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
    ) -> int:
        self.cur.execute(
            "INSERT INTO questions (name, category_name, db_file_path, vector_file_path) VALUES (?, ?, ?, ?)",
            (name, category_name, db_file_path, vector_file_path),
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

    def delete(self, question_id: int) -> None:
        self.cur.execute("DELETE FROM questions WHERE id = ?", (question_id,))
        self.conn.commit()