"""平台 Ed25519 公钥（与后台上传的签名私钥为同一密钥对）。

请在离线环境用 OpenSSL 等工具生成密钥对：私钥上传管理后台，公钥写入本文件。
支持 32 字节 Raw Base64 或 SPKI DER Base64。
"""

# 32 字节原始 Ed25519 公钥的 Base64；打包设备镜像前必须替换为实际值
PLATFORM_PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEAsHEyFtIYI38TcES7BV7KUqjuZeMvjYIAKFiV654fJSg="
