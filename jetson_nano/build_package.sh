#!/usr/bin/env bash
# jetson_nano 打包：Cython →（可选 PyArmor）→ PyInstaller 单文件
#
# 生产推荐：仅 Cython + PyInstaller onefile（默认跳过 PyArmor，与 onefile 不兼容）
#
# 用法（须在目标设备架构上执行，Jetson 请在 Orin 本机运行）：
#   cd jetson_nano
#   ./build_package.sh
#
# 产物：dist/yh-device（单个可执行文件，公钥已内置混淆编译）
#
# 可选环境变量：
#   YH_BUILD_PYTHON   指定 Python 解释器（默认 python3）
#   YH_USE_PYARMOR=1    启用 PyArmor（与单文件 PyInstaller 存在兼容问题，默认关闭）
#   YH_SKIP_PYARMOR=1   强制跳过 PyArmor
set -euo pipefail

case "${0}" in
  */*) cd "${0%/*}" ;;
  *) cd "." ;;
esac

ROOT="$(pwd)"
BUILD_DIR="$ROOT/build"
VENV_PY="$BUILD_DIR/.venv/bin/python3"
STAGING="$BUILD_DIR/staging"
OBF="$BUILD_DIR/obf"
CYTHON_OUT="$BUILD_DIR/cython"
WORK="$BUILD_DIR/pyinstaller-work"
DIST="$ROOT/dist"
RELEASE_EXE="$DIST/yh-device"

if [[ -n "${YH_BUILD_PYTHON:-}" ]]; then
  PY="$YH_BUILD_PYTHON"
elif [[ -x "$VENV_PY" ]]; then
  PY="$VENV_PY"
else
  PY="python3"
fi

echo "[1/6] 检查构建依赖..."
if [[ ! -x "$PY" ]] && ! command -v "$PY" >/dev/null 2>&1; then
  echo "[信息] 创建构建虚拟环境: $BUILD_DIR/.venv"
  python3 -m venv "$BUILD_DIR/.venv"
  PY="$VENV_PY"
fi

if ! "$PY" -c "import Cython" >/dev/null 2>&1; then
  echo "[信息] 安装 build/requirements-build.txt ..."
  if ! "$PY" -m pip install -r "$BUILD_DIR/requirements-build.txt"; then
    echo "[错误] 构建依赖安装失败。可手动执行:" >&2
    echo "  python3 -m venv $BUILD_DIR/.venv && $BUILD_DIR/.venv/bin/pip install -r $BUILD_DIR/requirements-build.txt" >&2
    exit 1
  fi
fi

if [[ "${YH_SKIP_PYARMOR:-}" != "1" ]]; then
  if ! command -v pyarmor >/dev/null 2>&1 && ! "$PY" -c "import pyarmor" >/dev/null 2>&1; then
    echo "[信息] 通过 pip 安装 pyarmor ..."
    "$PY" -m pip install 'pyarmor>=8.5.0'
  fi
fi

echo "[2/6] 准备 staging ..."
rm -rf "$STAGING" "$OBF" "$CYTHON_OUT" "$WORK" "$RELEASE_EXE" "$DIST/yh_bin" "$DIST/jetson_nano_release"
mkdir -p "$STAGING" "$OBF" "$CYTHON_OUT"

shopt -s nullglob
for py in "$ROOT"/*.py; do
  cp "$py" "$STAGING/"
done
cp "$ROOT/device_verification_codes.json" "$STAGING/"

echo "[3/6] PyArmor 混淆 ..."
OBF_SRC="$OBF"
if [[ "${YH_USE_PYARMOR:-}" != "1" || "${YH_SKIP_PYARMOR:-}" == "1" ]]; then
  if [[ "${YH_SKIP_PYARMOR:-}" == "1" ]]; then
    echo "[信息] 已跳过 PyArmor（YH_SKIP_PYARMOR=1）"
  else
    echo "[信息] 单文件模式默认跳过 PyArmor（逻辑与公钥由 Cython 编入 .so 并打入可执行文件）"
    echo "[信息] 若需尝试 PyArmor 可设 YH_USE_PYARMOR=1（可能与单文件打包不兼容）"
  fi
  cp -a "$STAGING"/. "$OBF/"
else
  PYARMOR_CMD=(pyarmor)
  if ! command -v pyarmor >/dev/null 2>&1; then
    PYARMOR_CMD=("$PY" -m pyarmor.cli)
  fi
  mkdir -p "$OBF"
  _OBF_TARGETS=()
  while IFS= read -r _py; do
    _OBF_TARGETS+=("$_py")
  done < <(find "$STAGING" -maxdepth 1 -name '*.py' | sort)
  if ((${#_OBF_TARGETS[@]} == 0)); then
    echo "[错误] staging 中没有可混淆的 Python 文件" >&2
    exit 1
  fi
  "${PYARMOR_CMD[@]}" gen -O "$OBF" "${_OBF_TARGETS[@]}"
  # 兼容旧版 PyArmor 仍输出到子目录的情况
  if [[ -d "$OBF/staging" ]]; then
    cp -a "$OBF/staging/." "$OBF/"
    rm -rf "$OBF/staging"
  fi
fi
cp "$STAGING/device_verification_codes.json" "$OBF/device_verification_codes.json"

echo "[4/6] Cython 编译 ..."
"$PY" "$BUILD_DIR/setup_cython.py" "$OBF" "$CYTHON_OUT"

# 将 PyArmor 运行时复制到 Cython 产物目录，供 PyInstaller 打包
for rt_dir in "$OBF"/pyarmor_runtime_*; do
  if [[ -d "$rt_dir" ]]; then
    cp -a "$rt_dir" "$CYTHON_OUT/"
  fi
done

echo "[5/6] PyInstaller 冻结 ..."
export YH_CYTHON_DIR="$CYTHON_OUT"
if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/opt/homebrew/opt/expat/lib" ]]; then
  # Homebrew Python 的 pyexpat 依赖新版 libexpat，需优先加载 brew 版本而非 /usr/lib
  export DYLD_LIBRARY_PATH="/opt/homebrew/opt/expat/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
fi
if ! "$PY" "$BUILD_DIR/run_pyinstaller.py" \
  --noconfirm \
  --clean \
  --distpath "$DIST" \
  --workpath "$WORK" \
  "$BUILD_DIR/yh_jetson.spec"; then
  echo "[错误] PyInstaller 失败。" >&2
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "[提示] Mac 上若出现 pyexpat / libexpat 错误，可尝试:" >&2
    echo "  export DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib" >&2
    echo "  brew install expat && brew reinstall python@3.13" >&2
    echo "[提示] 正式设备包建议在 Jetson Orin 上执行 ./build_package.sh" >&2
  fi
  exit 1
fi

echo "[6/6] 完成 ..."
if [[ ! -f "$RELEASE_EXE" ]]; then
  echo "[错误] 未找到打包产物: $RELEASE_EXE" >&2
  exit 1
fi
chmod +x "$RELEASE_EXE"

cat <<EOF

[完成] 单文件可执行已生成: $RELEASE_EXE

部署步骤：
  1. 将 yh-device 复制到 Jetson 目标目录
  2. 打包前请在源码 platform_public_key.py 中写入生产公钥（已内置进可执行文件）
  3. chmod +x yh-device && ./yh-device
  4. 查看指纹: ./yh-device --fingerprint

EOF
