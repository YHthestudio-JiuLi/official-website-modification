from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel

from ..modules import DatabaseManager
from ..utils import connect, get_db_lock

logger = logging.getLogger("py_backend")

router = APIRouter(prefix="/api/questions", tags=["questions"])

# 项目根（与 api-server 所在目录一致），题库文件落在 uploads/questions 下
PROJECT_ROOT = Path(__file__).resolve().parents[2]
QUESTIONS_UPLOAD_DIR = PROJECT_ROOT / "uploads" / "questions"
QUESTIONS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _resolve_local_upload_path(stored: str | None) -> Path | None:
    """将数据库中的路径解析为本机绝对路径（兼容历史绝对路径与 /uploads/...）。"""
    if not stored:
        return None
    s = str(stored).strip().replace("\\", "/")
    if s.startswith("/uploads/") or s.startswith("uploads/"):
        return (PROJECT_ROOT / s.lstrip("/")).resolve()
    p = Path(s)
    if p.is_absolute():
        return p
    return (PROJECT_ROOT / s).resolve()


def _to_portable_stored_path(abs_path: Path) -> str:
    """写入 SQLite 的路径统一为 /uploads/...，便于 Node 在任意部署目录下解析。"""
    try:
        rel = abs_path.resolve().relative_to(PROJECT_ROOT.resolve())
    except ValueError:
        return str(abs_path)
    return "/" + rel.as_posix()


class QuestionUpdate(BaseModel):
    name: str
    category_name: str | None = None
    db_file_path: str | None = None
    vector_file_path: str | None = None


def get_db_manager() -> DatabaseManager:
    conn = connect()
    return DatabaseManager(conn)


@router.get("")
async def list_questions(db_manager: DatabaseManager = Depends(get_db_manager)) -> List[Dict[str, Any]]:
    try:
        questions = db_manager.questions.find_all()
        return questions
    except Exception as e:
        logger.error(f"Failed to list questions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{id}")
async def get_question(id: int, db_manager: DatabaseManager = Depends(get_db_manager)) -> Dict[str, Any]:
    try:
        question = db_manager.questions.find_by_id(id)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        return question
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get question {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_question(
    db_manager: DatabaseManager = Depends(get_db_manager),
    db_file: UploadFile = File(None),
    vector_file: UploadFile = File(None),
    name: str = Form(...),
    category_name: str | None = Form(None)
) -> Dict[str, Any]:
    logger.info(f"Create question request - name: {name}, db_file: {db_file.filename if db_file else None}, vector_file: {vector_file.filename if vector_file else None}")
    
    try:
        with get_db_lock():
            question_id = db_manager.questions.create(
                name=name,
                category_name=(category_name.strip() if category_name else None),
                db_file_path=None,
                vector_file_path=None
            )
        
        question_dir = QUESTIONS_UPLOAD_DIR / str(question_id)
        question_dir.mkdir(parents=True, exist_ok=True)
        
        db_file_path = None
        vector_file_path = None
        
        if db_file and db_file.filename:
            db_abs = question_dir / db_file.filename
            with open(db_abs, "wb") as buffer:
                shutil.copyfileobj(db_file.file, buffer)
            db_file_path = _to_portable_stored_path(db_abs)
            logger.info(f"Uploaded db file for question {question_id}: {db_file_path}")
        
        if vector_file and vector_file.filename:
            vec_abs = question_dir / vector_file.filename
            with open(vec_abs, "wb") as buffer:
                shutil.copyfileobj(vector_file.file, buffer)
            vector_file_path = _to_portable_stored_path(vec_abs)
            logger.info(f"Uploaded vector file for question {question_id}: {vector_file_path}")
        
        if db_file_path or vector_file_path:
            with get_db_lock():
                db_manager.questions.update_fields(
                    question_id=question_id,
                    name=None,
                    db_file_path=db_file_path,
                    vector_file_path=vector_file_path
                )
        
        logger.info(f"Created question {question_id}: {name}")
        return {
            "ok": True,
            "id": question_id,
            "category_name": (category_name.strip() if category_name else None),
            "db_file_path": db_file_path,
            "vector_file_path": vector_file_path
        }
    except Exception as e:
        logger.error(f"Failed to create question: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{id}")
async def update_question(
    id: int,
    db_manager: DatabaseManager = Depends(get_db_manager),
    db_file: UploadFile = File(None),
    vector_file: UploadFile = File(None),
    name: str = Form(...),
    category_name: str | None = Form(None),
    clear_db_file: bool = Form(False),
    clear_vector_file: bool = Form(False)
) -> Dict[str, Any]:
    try:
        question = db_manager.questions.find_by_id(id)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        
        question_dir = QUESTIONS_UPLOAD_DIR / str(id)
        question_dir.mkdir(parents=True, exist_ok=True)
        
        db_file_path = question.get("db_file_path")
        vector_file_path = question.get("vector_file_path")
        
        if clear_db_file:
            p_db = _resolve_local_upload_path(db_file_path)
            if p_db and p_db.is_file():
                try:
                    p_db.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete db file: {e}")
            db_file_path = None
        
        if clear_vector_file:
            p_vec = _resolve_local_upload_path(vector_file_path)
            if p_vec and p_vec.is_file():
                try:
                    p_vec.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete vector file: {e}")
            vector_file_path = None
        
        if db_file and db_file.filename:
            new_db_abs = question_dir / db_file.filename
            with open(new_db_abs, "wb") as buffer:
                shutil.copyfileobj(db_file.file, buffer)
            db_file_path = _to_portable_stored_path(new_db_abs)
            logger.info(f"Updated db file for question {id}: {db_file_path}")
        
        if vector_file and vector_file.filename:
            new_vec_abs = question_dir / vector_file.filename
            with open(new_vec_abs, "wb") as buffer:
                shutil.copyfileobj(vector_file.file, buffer)
            vector_file_path = _to_portable_stored_path(new_vec_abs)
            logger.info(f"Updated vector file for question {id}: {vector_file_path}")
        
        with get_db_lock():
            db_manager.questions.update_fields(
                question_id=id,
                name=name,
                category_name=(category_name.strip() if category_name else None),
                db_file_path=db_file_path,
                vector_file_path=vector_file_path
            )
        
        logger.info(f"Updated question {id}")
        return {
            "ok": True,
            "category_name": (category_name.strip() if category_name else None),
            "db_file_path": db_file_path,
            "vector_file_path": vector_file_path
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update question {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{id}")
async def delete_question(
    id: int,
    db_manager: DatabaseManager = Depends(get_db_manager)
) -> Dict[str, Any]:
    try:
        question = db_manager.questions.find_by_id(id)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        
        question_dir = QUESTIONS_UPLOAD_DIR / str(id)
        if question_dir.exists():
            shutil.rmtree(question_dir)
        
        with get_db_lock():
            db_manager.questions.delete(id)
        logger.info(f"Deleted question {id}")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete question {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))