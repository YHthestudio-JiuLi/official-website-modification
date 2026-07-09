#!/usr/bin/env bash
# Jetson Orin Nano 首次部署：依赖、指纹采集、TTS 资源说明
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(pwd)"

echo "[1/4] 安装 Python 依赖..."
python3 -m pip install --user -r requirements.txt

echo "[2/4] 检查 TTS 系统依赖（sox、alsa-utils）..."
missing=()
command -v sox >/dev/null 2>&1 || missing+=("sox")
command -v aplay >/dev/null 2>&1 || missing+=("alsa-utils")
if ((${#missing[@]} > 0)); then
  echo "[提示] 未检测到: ${missing[*]}。语音播报需要安装，例如:"
  echo "  sudo apt-get install -y sox alsa-utils"
fi

echo "[3/4] 设置可执行权限..."
chmod +x run_demo.sh build_package.sh install.sh 2>/dev/null || true
[[ -f "$ROOT/yh-device" ]] && chmod +x "$ROOT/yh-device"
[[ -f "$ROOT/dist/yh-device" ]] && chmod +x "$ROOT/dist/yh-device"
[[ -f "$ROOT/tts/piper/piper" ]] && chmod +x "$ROOT/tts/piper/piper"

echo "[4/4] 采集设备指纹（请录入管理后台「预置指纹」）..."
if [[ -x "$ROOT/yh-device" ]]; then
  FP="$("$ROOT/yh-device" --fingerprint)"
elif [[ -x "$ROOT/dist/yh-device" ]]; then
  FP="$("$ROOT/dist/yh-device" --fingerprint)"
elif [[ -f "$ROOT/yh_main.py" ]]; then
  FP="$(python3 "$ROOT/yh_main.py" --fingerprint)"
else
  FP="$(python3 -c "from device_fingerprint import build_device_fingerprint; print(build_device_fingerprint())")"
fi

if [[ -z "${FP}" ]]; then
  echo "[错误] 指纹采集失败，请检查 /etc/machine-id 与存储设备信息是否可读" >&2
  exit 1
fi

echo ""
echo "======== 设备指纹（复制到后台） ========"
echo "${FP}"
echo "========================================"
echo ""
echo "下一步："
echo "  1. 将 YH_Nano_Rag/tts 复制到本目录 tts/（含 piper 与 zh_CN-huayan-medium.onnx）"
echo "  2. 在管理后台添加设备、填入上述指纹并启用，绑定固件与题库"
echo "  3. 在 Jetson 本机构建: ./build_package.sh  →  dist/yh-device"
echo "  4. 运行: ./yh-device  或  ./run_demo.sh"
echo ""
echo "说明："
echo "  - 公钥已编译进 yh-device，无需外置 platform_public_key.py"
echo "  - 生产默认 API: https://yhthestudio.com"
echo "  - 本地联调: API_BASE=http://你的服务器 ./yh-device"
