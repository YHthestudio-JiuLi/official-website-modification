"""YH 固件与题库本地路径约定（jetson_nano 客户端共享）。"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

FIRMWARE_MARKER = ".firmware_ready"
BINDING_STATE_FILE = ".binding_state.json"
DIST_STUDIO_REL = Path("dist") / "YHTheStudio"
INTERNAL_DATA_REL = DIST_STUDIO_REL / "_internal" / "data"


def dist_studio_root(yh_dir: Path) -> Path:
    """固件应用根目录 YH/dist/YHTheStudio。"""
    return yh_dir / DIST_STUDIO_REL


def internal_data_path(yh_dir: Path) -> Path:
    """题库与向量索引标准落盘目录 YH/dist/YHTheStudio/_internal/data。"""
    return yh_dir / INTERNAL_DATA_REL


def purge_local_artifacts(yh_dir: Path) -> None:
    """绑定变化时清理旧题库和旧固件。"""
    for rel in (
        "questions.db",
        "faiss.index",
        "YHTheStudio/data/questions.db",
        "YHTheStudio/data/faiss.index",
        "dist/YHTheStudio/data/questions.db",
        "dist/YHTheStudio/data/faiss.index",
        "dist/YHTheStudio/_internal/data/questions.db",
        "dist/YHTheStudio/_internal/data/faiss.index",
    ):
        p = yh_dir / rel
        if p.is_file():
            p.unlink(missing_ok=True)

    for rel in ("dist", "__MACOSX", "_internal", "models", "tts", "YHTheStudio"):
        p = yh_dir / rel
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)

    marker = yh_dir / FIRMWARE_MARKER
    marker.unlink(missing_ok=True)
    state_file = yh_dir / BINDING_STATE_FILE
    state_file.unlink(missing_ok=True)
    for pattern in ("*.zip", "*.tar.gz", "*.tgz", "*.tar", "*.gz"):
        for p in yh_dir.glob(pattern):
            if p.is_file():
                p.unlink(missing_ok=True)


def resolve_data_dir(yh_dir: Path) -> Path:
    """定位题库目标目录，默认 dist/YHTheStudio/_internal/data。"""
    app_dir = os.environ.get("YH_APP_DIR", "").strip()
    if app_dir:
        data_dir = yh_dir / app_dir / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir

    internal_data = internal_data_path(yh_dir)
    studio_root = dist_studio_root(yh_dir)
    if studio_root.is_dir():
        internal_data.mkdir(parents=True, exist_ok=True)
        return internal_data

    legacy_dist_data = studio_root / "data"
    if legacy_dist_data.exists():
        return legacy_dist_data

    default_dir = yh_dir / "YHTheStudio" / "data"
    if default_dir.exists():
        return default_dir

    for child in yh_dir.iterdir():
        if child.is_dir() and (child / "data").is_dir():
            return child / "data"

    internal_data.mkdir(parents=True, exist_ok=True)
    return internal_data


def firmware_ready(yh_dir: Path) -> bool:
    """检查固件是否已经就绪。"""
    marker = yh_dir / FIRMWARE_MARKER
    if marker.is_file():
        return True
    studio = dist_studio_root(yh_dir)
    if studio.is_dir() and (studio / "_internal").is_dir():
        if (studio / "YHTheStudio").is_file() or (studio / "YHTheStudio.bin").is_file():
            return True
        if (studio / "models").is_dir():
            return True
    app_root = yh_dir / "YHTheStudio"
    if app_root.is_dir() and (app_root / "_internal").is_dir() and (app_root / "models").is_dir():
        return True
    if (yh_dir / "_internal").is_dir() and (yh_dir / "models").is_dir():
        return True
    return False
