from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("py_backend")

# 与 Node api-server 项目根一致
PROJECT_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_UPLOAD_DIR = PROJECT_ROOT / "uploads" / "questions"
FIRMWARE_UPLOAD_DIR = PROJECT_ROOT / "uploads" / "nano-firmwares"


def resolve_upload_path(stored: str | None) -> Optional[Path]:
    """将数据库中的路径解析为本机绝对路径（兼容 /uploads/... 与历史绝对路径）。"""
    if not stored:
        return None
    raw = str(stored).strip().replace("\\", "/")
    if not raw:
        return None
    if raw.startswith("/uploads/") or raw.startswith("uploads/"):
        return (PROJECT_ROOT / raw.lstrip("/")).resolve()
    candidate = Path(raw)
    if candidate.is_absolute():
        return candidate.resolve()
    return (PROJECT_ROOT / raw).resolve()


def _is_under_dir(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def delete_question_upload_files(question_id: int, question: Optional[Dict[str, Any]] = None) -> None:
    """删除题库在 uploads 中的目录及关联文件。"""
    question_dir = QUESTIONS_UPLOAD_DIR / str(question_id)
    if question_dir.exists():
        try:
            shutil.rmtree(question_dir)
            logger.info("已删除题库目录: %s", question_dir)
        except OSError as exc:
            logger.warning("删除题库目录失败 %s: %s", question_dir, exc)

    if not question:
        return

    for field in ("db_file_path", "vector_file_path"):
        file_path = resolve_upload_path(question.get(field))
        if not file_path or not file_path.is_file():
            continue
        if question_dir.exists() and _is_under_dir(file_path, question_dir):
            continue
        try:
            file_path.unlink()
            logger.info("已删除题库文件: %s", file_path)
        except OSError as exc:
            logger.warning("删除题库文件失败 %s: %s", file_path, exc)


def delete_firmware_upload_file(file_url: str | None) -> None:
    """删除固件在 uploads/nano-firmwares 中的物理文件。"""
    file_path = resolve_upload_path(file_url)
    if not file_path:
        return
    if not _is_under_dir(file_path, FIRMWARE_UPLOAD_DIR):
        logger.warning("跳过非固件目录文件: %s", file_path)
        return
    if not file_path.is_file():
        return
    try:
        file_path.unlink()
        logger.info("已删除固件文件: %s", file_path)
    except OSError as exc:
        logger.warning("删除固件文件失败 %s: %s", file_path, exc)


def delete_question_with_files(db_manager, question_id: int) -> None:
    """解除设备绑定、清理 uploads、删除数据库记录。"""
    from .utils import get_db_lock

    question = db_manager.questions.find_by_id(question_id)
    if not question:
        raise ValueError("Question not found")

    with get_db_lock():
        db_manager.questions.unlink_devices(question_id)

    delete_question_upload_files(question_id, question)

    with get_db_lock():
        db_manager.questions.delete_row(question_id)
