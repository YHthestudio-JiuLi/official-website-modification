"""与 YH_Nano_Rag 一致的 PiperTTS 播报实现。"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Piper / aplay 不可用时的提示仅记录一次
_aplay_fail_logged = False
_piper_skip_logged = False
_BRACKET_PREFIX_RE = re.compile(r"^\[[^\]]+\]\s*")


def tts_enabled() -> bool:
    """是否启用 TTS（默认开启；设 YH_TTS=0 可关闭）。"""
    flag = os.environ.get("YH_TTS", "1").strip().lower()
    return flag not in ("0", "false", "off", "no")


def piper_model_path(app_root: Path) -> str | None:
    """解析 Piper 模型路径。"""
    p = (os.environ.get("YHTHESTUDIO_PIPER_MODEL") or "").strip()
    if p and Path(p).is_file():
        return p
    candidates = [
        app_root / "tts" / "zh_CN-huayan-medium.onnx",
        Path.cwd() / "tts" / "zh_CN-huayan-medium.onnx",
    ]
    for default_model in candidates:
        if default_model.is_file():
            return str(default_model)
    return None


def piper_cli_path(app_root: Path) -> str | None:
    """解析 Piper 可执行文件路径。"""
    p = app_root / "tts" / "piper" / "piper"
    if p.is_file() and sys.platform.startswith("linux"):
        return str(p)
    exe_dir = Path(sys.executable).resolve().parent
    for name in ("piper", "piper.exe"):
        candidate = exe_dir / name
        if candidate.is_file():
            return str(candidate)
    return shutil.which("piper")


def _log_piper_skip_once(message: str) -> None:
    global _piper_skip_logged
    if _piper_skip_logged:
        return
    _piper_skip_logged = True
    logger.debug(message)
    print(f"[提示] {message}", file=sys.stderr, flush=True)


def find_cm108b_card_aplay() -> int | None:
    """自动查找 USB 声卡 card id。"""
    global _aplay_fail_logged
    try:
        output = subprocess.check_output(["aplay", "-l"]).decode("utf-8")
        for line in output.splitlines():
            if "card" in line and "USB" in line:
                card_part = line.split(":")[0]
                card_id = card_part.split(" ")[1]
                return int(card_id)
    except Exception as e:
        if not _aplay_fail_logged:
            _aplay_fail_logged = True
            logger.warning("获取声卡失败: %s", e)
    return None


def piper_say_cmd(
    text: str,
    speed: float,
    volume: float,
    *,
    app_root: Path,
    model_path: str | None = None,
    piper_path: str | None = None,
    card_id: int | None = None,
) -> bool:
    """通过命令行执行 Piper 播报。"""
    if model_path is None:
        model_path = piper_model_path(app_root) or str(app_root / "tts" / "zh_CN-huayan-medium.onnx")
    if piper_path is None:
        piper_path = piper_cli_path(app_root) or str(app_root / "tts" / "piper" / "piper")

    if not sys.platform.startswith("linux"):
        _log_piper_skip_once("[TTS] 当前平台非 Linux，跳过 Piper 管道。")
        return False

    if card_id is None:
        card_id = find_cm108b_card_aplay()

    if not shutil.which("sox") or not shutil.which("aplay"):
        _log_piper_skip_once("[TTS] 缺少 sox/aplay，跳过 Piper 管道。")
        return False

    if not os.path.isfile(piper_path):
        print(f"[提示] Piper 可执行文件不存在: {piper_path}", file=sys.stderr, flush=True)
        return False

    if not os.path.isfile(model_path):
        print(
            f"[提示] Piper 模型不存在: {model_path}（请将 YH_Nano_Rag/tts 复制到部署目录 tts/）",
            file=sys.stderr,
            flush=True,
        )
        return False

    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = "-1"
    env["ORT_TENSORRT_UNAVAILABLE"] = "1"
    piper_dir = str(Path(piper_path).parent)
    existing_ld = env.get("LD_LIBRARY_PATH", "")
    if piper_dir not in existing_ld:
        env["LD_LIBRARY_PATH"] = f"{piper_dir}:{existing_ld}" if existing_ld else piper_dir

    if card_id is not None:
        aplay_dev = f"plughw:{card_id},0"
    else:
        aplay_dev = "default"

    # 补白防止最后几个字被截断
    full_text = f"{text} 。 。 。"
    tts_debug = os.environ.get("YH_TTS_DEBUG", "").strip().lower() in ("1", "true", "on", "yes")
    stderr_target = subprocess.PIPE if tts_debug else subprocess.DEVNULL

    piper_cmd = [
        piper_path,
        "--model",
        model_path,
        "--length_scale",
        str(speed),
        "--output_raw",
        "--sentence_silence",
        "0.1",
    ]
    sox_cmd = [
        "sox",
        "-t",
        "raw",
        "-r",
        "22050",
        "-e",
        "signed-integer",
        "-b",
        "16",
        "-c",
        "1",
        "-",
        "-t",
        "raw",
        "-",
        "vol",
        str(volume),
    ]
    aplay_cmd = [
        "aplay",
        "-r",
        "22050",
        "-f",
        "S16_LE",
        "-t",
        "raw",
        "-D",
        aplay_dev,
    ]

    logger.debug("Piper 管道: %s | %s | %s", piper_cmd, sox_cmd, aplay_cmd)
    try:
        piper_proc = subprocess.Popen(
            piper_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=stderr_target,
            cwd=str(app_root),
            env=env,
            start_new_session=True,
        )
        sox_proc = subprocess.Popen(
            sox_cmd,
            stdin=piper_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=stderr_target,
            env=env,
        )
        if piper_proc.stdout is not None:
            piper_proc.stdout.close()

        subprocess.Popen(
            aplay_cmd,
            stdin=sox_proc.stdout,
            stdout=subprocess.DEVNULL,
            stderr=stderr_target,
            env=env,
        )
        if sox_proc.stdout is not None:
            sox_proc.stdout.close()

        if piper_proc.stdin is None:
            return False
        piper_proc.stdin.write(full_text.encode("utf-8"))
        piper_proc.stdin.close()
        return True
    except Exception as e:
        logger.error("Piper 发生意外错误: %s", e)
        print(f"[提示] TTS 启动失败: {e}", file=sys.stderr, flush=True)
        return False


def speak(message: str, *, app_root: Path) -> None:
    """给验证程序统一入口调用。"""
    if not tts_enabled():
        return
    text = _BRACKET_PREFIX_RE.sub("", message).strip()
    if not text:
        return

    speed = float(os.environ.get("YH_TTS_SPEED", "1.1"))
    volume = float(os.environ.get("YH_TTS_VOLUME", "1"))
    card_id_raw = os.environ.get("YH_TTS_CARD_ID", "").strip()
    card_id = int(card_id_raw) if card_id_raw.isdigit() else None
    piper_say_cmd(text, speed, volume, app_root=app_root, card_id=card_id)

