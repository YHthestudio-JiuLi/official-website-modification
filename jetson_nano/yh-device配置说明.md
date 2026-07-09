# yh-device 配置说明

本文档说明 Jetson 设备端验证程序 `yh-device`

---

## 1. 部署目录结构

`yh-device` 为**单文件可执行程序**，工作数据写在**可执行文件所在目录**（可用 `YH_APP_ROOT` 覆盖）。

推荐布局：

```text
部署目录/
├── yh-device              # 主程序（须 chmod +x）
├── tts/                   # Piper TTS 资源（语音播报必需，未打进单文件）
│   ├── zh_CN-huayan-medium.onnx
│   ├── zh_CN-huayan-medium.onnx.json
│   └── piper/
│       ├── piper          # aarch64 可执行文件（须 chmod +x）
│       └── lib*.so 等
├── last_verify.json       # 运行后自动生成：签名缓存与 verified_at
├── YH/                    # 运行后自动生成：固件与题库
├── yh_background_sync.pid # YH_DAEMON=1 时可能出现
└── yh_background_sync.log
```

**注意：**

- 若 `Permission denied`，执行：`chmod +x yh-device tts/piper/piper`
- 公钥在**打包前**写入源码 ，已编译进 `yh-device`，部署时无需外置公钥文件。

---

## 命令行参数

```bash
./yh-device                    # 默认：验证 → 下载 → 启动 YHTheStudio
./yh-device --fingerprint      # 仅输出设备指纹
./yh-device --background-sync  # 后台轮询同步（通常由 YH_DAEMON=1 自动拉起）
./yh-device -- <studio参数>    # 传递给 YHTheStudio 的额外参数
```


## 环境变量一览

### 联网与 API

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `API_BASE` | `https://yhthestudio.com`（全模块统一，见 `yh_config.py`） | 官网 API 根地址，**不要**带末尾 `/`；验签/下载在拉签成功后优先用 `last_verify.json` 中的 `api_base` |

**示例：**

```bash
# 生产
export API_BASE=https://yhthestudio.com
```

拉签成功后会将 `api_base` 写入 `last_verify.json`，后续验签与下载优先使用该值。

---

### 路径与工作目录

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `YH_APP_ROOT` | `yh-device` 所在目录（打包模式） | 部署根目录：`last_verify.json`、`YH/`、`tts/` 均相对此路径 |
| `YH_APP_DIR` | 自动推导为 `YH/dist/YHTheStudio/_internal` | 覆盖题库落盘的父目录（高级用法） |

---

### 验证冷却与后台同步

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VERIFY_INTERVAL_HOURS` | `0.1`（6 分钟） | 距上次 `verified_at` 多少小时内跳过重新拉签/验签/下载，直接启动应用 |
| `YH_DAEMON` | `0` | 设为 `1` 时，设备未启用或同步失败会后台拉起 `--background-sync` 轮询 |
| `YH_POLL_INTERVAL` | `45` | 后台同步轮询间隔（秒），最小 15 |

**示例：**

```bash
# 12 小时内不重复验证
export VERIFY_INTERVAL_HOURS=12

# 未启用时自动后台等待管理员开通
export YH_DAEMON=1
export YH_POLL_INTERVAL=30
```

---

### TTS 语音播报（Piper）

默认**开启** 播报内容为日志里 `[播报]` 后的文字

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `YH_TTS` | `1` | `0` / `false` / `off` 关闭语音 |
| `YH_TTS_SPEED` | `1.1` | Piper 语速（`length_scale`） |
| `YH_TTS_VOLUME` | `1` | sox 音量系数 |
| `YH_TTS_CARD_ID` | 自动探测 USB 声卡 | 手动指定 `aplay` 声卡号，如 `0` |
| `YH_TTS_DEBUG` | 未设置 | 设为 `1` 时 Piper/sox/aplay 保留 stderr 便于排查 |
| `YHTHESTUDIO_PIPER_MODEL` | `<部署目录>/tts/zh_CN-huayan-medium.onnx` | 自定义 ONNX 模型路径 |

**Jetson 上出声条件：**

- 同目录存在完整 `tts/`
- 已安装系统依赖：`sudo apt install -y sox alsa-utils`
- 仅在 **Linux** 上走 Piper 管线；开发机（macOS 等）跳过 Piper，属正常

**会触发 TTS 的典型 `[播报]` 文案**（均定义于 `device_errors.py`）：

- 设备未启用或无法验证，请联系平台管理员
- 设备验证通过，正在自动构建系统。请稍候
- 系统构建完成，正在启动程序。首次启动需要一定时间，请耐心等待
- 设备未绑定系统程序，请联系平台管理员
- 设备未启用或签名失效，请联系平台管理员
- 设备验证次数已达上限，请联系管理员（拉签/验签 API 错误时）
- 拉取验证签名失败，请检查网络后重试
- 设备验证失败，请检查网络或联系平台管理员
- 资源下载失败，请检查网络后重试

---

### 资源下载

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `YH_PARALLEL_DOWNLOAD` | `1` | `0` / `false` / `off` 关闭 HTTP Range 并行分片 |
| `YH_DOWNLOAD_CONCURRENCY` | `4` | 并行路数，范围 1～8 |

---

### 日志与退出码

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `YH_RUN_DEMO` | 程序内默认 `1` | `1` 精简日志（仅关键 `[播报]`/`[错误]` 等）；`0` 输出详细 `[信息]` |
| `YH_STRICT_EXIT` | 未设置 | `1` 时严格透传业务退出码（监控/CI 用）；默认将部分可恢复退出码映射为 0 |

---

### 源码开发专用（打包后 yh-device 不需要）

| 变量 | 说明 |
|------|------|
| `YH_PYTHON` | `run_demo.sh` 指定 Python 解释器 |

---

## 本地数据文件

### `last_verify.json`

验证成功后自动生成，典型字段：

```json
{
  "fingerprint": "...",
  "issued_at": 1783589779,
  "signature": "...",
  "api_base": "http://127.0.0.1:3000",
  "verified_at": 1783589779
}
```

- `verified_at`：用于 `VERIFY_INTERVAL_HOURS` 冷却判断
- 删除该文件会触发完整重新验证；若存在 `YH/` 目录会先清理再拉签

---

## 退出码

| 码 | 含义 |
|----|------|
| `0` | 正常（含设备未启用等可恢复场景，便于定时任务重试） |
| `1` | 拉签失败、验签失败、验证次数用尽等 |
| `2` | 验签/鉴权类问题（下载阶段） |
| `3` | 下载失败等 |
| `4` | 网站未完整绑定固件+题库（不删 YH、不启动主程序） |

---

## 常用启动示例

### 生产环境（Jetson）

```bash
cd ~/Desktop/Jetson_Orin
chmod +x yh-device tts/piper/piper

export API_BASE=https://yhthestudio.com
export VERIFY_INTERVAL_HOURS=12
export YH_DAEMON=1

./yh-device
```

### 本地联调

```bash
export API_BASE='本地服务地址'
export VERIFY_INTERVAL_HOURS=0.1
./yh-device
```

### 仅查看指纹

```bash
./yh-device --fingerprint
```

---

## 开机自动运行（systemd）

`/etc/systemd/system/yh-device.service` 示例：

```ini
[Unit]
Description=YH Device Verify and Launch
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=yh
WorkingDirectory=/home/yh/Desktop/Jetson_Orin
Environment=API_BASE=https://yhthestudio.com
Environment=VERIFY_INTERVAL_HOURS=12
Environment=YH_DAEMON=1
Environment=YH_TTS=1
ExecStart=/home/yh/Desktop/Jetson_Orin/yh-device
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable yh-device
sudo systemctl start yh-device
journalctl -u yh-device -f
```

---

## 进程与资源占用

- 验证、下载阶段：`yh-device` 正常运行，结束后进入启动阶段。
- 启动 `YHTheStudio` 时使用 `os.execv()`：**当前进程被 YHTheStudio 替换**，`yh-device` 不会长期占用 CPU/内存。
- `YH_DAEMON=1` 时可能另有 `yh-device --background-sync` 子进程常驻轮询。
- TTS 播报为短时子进程（`piper` / `sox` / `aplay`），播完即退出。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `Permission denied` | `chmod +x yh-device` |
| `cannot execute binary file` | 使用了开发环境版二进制，须在 Jetson 本机重新打包 |
| 无语音播报 | 检查 `tts/`、`sox`、`aplay`；开发环境上无 Piper 属正常 |
| 一直重新验证 | 检查 `VERIFY_INTERVAL_HOURS` 与 `last_verify.json` 中 `verified_at` |
| 连错服务器 | 检查 `API_BASE` 或删除 `last_verify.json` 后重跑 |
