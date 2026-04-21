"""
设备验证签名HTTP接口测试
通过HTTP调用API测试签名验证流程
"""
import requests
import json
import time
import base64

BASE_URL = "http://127.0.0.1:3000"
ADMIN_URL = f"{BASE_URL}/api/admin"

admin_token = None


def login_admin():
    """管理员登录获取session"""
    global admin_token
    response = requests.post(f"{BASE_URL}/api/admin/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        print(f"✓ 管理员登录成功")
        return response.cookies
    else:
        print(f"✗ 登录失败: {response.text}")
        return None


def test_create_device(cookies, device_id, max_verifications=10):
    """测试创建设备"""
    response = requests.post(
        f"{ADMIN_URL}/devices",
        json={"device_id": device_id, "max_verifications": max_verifications},
        cookies=cookies
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✓ 创建设备成功: {device_id}")
        return data.get("device")
    else:
        print(f"✗ 创建设备失败: {response.text}")
        return None


def test_get_devices(cookies):
    """测试获取设备列表"""
    response = requests.get(f"{ADMIN_URL}/devices", cookies=cookies)
    if response.status_code == 200:
        devices = response.json().get("devices", [])
        print(f"✓ 获取设备列表成功: {len(devices)} 个设备")
        return devices
    else:
        print(f"✗ 获取设备列表失败: {response.text}")
        return []


def test_get_device_keys(cookies, device_id):
    """测试获取设备密钥"""
    response = requests.get(f"{ADMIN_URL}/devices/{device_id}/keys", cookies=cookies)
    if response.status_code == 200:
        data = response.json()
        print(f"✓ 获取密钥成功")
        print(f"  公钥: {data['public_key'][:30]}...")
        print(f"  私钥: {data['private_key'][:30]}...")
        return data
    else:
        print(f"✗ 获取密钥失败: {response.text}")
        return None


def test_verify_device(device_id):
    """测试设备验证（生成签名）"""
    response = requests.post(
        f"{BASE_URL}/api/device/verify",
        json={"device_id": device_id},
        headers={"User-Agent": "TestClient/1.0", "X-Forwarded-For": "192.168.1.100"}
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✓ 验证成功，签名已生成")
        print(f"  device_id: {data['device_id']}")
        print(f"  issued_at: {data['issued_at']}")
        print(f"  signature: {data['signature'][:40]}...")
        return data
    elif response.status_code == 403:
        print(f"✗ 验证失败: 配额已用完")
        return None
    else:
        print(f"✗ 验证失败: {response.text}")
        return None


def test_get_public_key(device_id):
    """测试获取公钥（无需登录）"""
    response = requests.get(f"{BASE_URL}/api/device/{device_id}/public-key")
    if response.status_code == 200:
        data = response.json()
        print(f"✓ 获取公钥成功: {data['public_key'][:30]}...")
        return data["public_key"]
    else:
        print(f"✗ 获取公钥失败: {response.text}")
        return None


def test_get_verification_logs(cookies, device_id):
    """测试获取验证日志"""
    response = requests.get(f"{ADMIN_URL}/devices/{device_id}/logs", cookies=cookies)
    if response.status_code == 200:
        data = response.json()
        logs = data.get("logs", [])
        total = data.get("total", 0)
        print(f"✓ 获取日志成功: {total} 条记录")
        for i, log in enumerate(logs[:3]):
            print(f"  [{i+1}] 时间: {log['created_at']}, IP: {log['ip_address']}")
        return logs
    else:
        print(f"✗ 获取日志失败: {response.text}")
        return []


def test_reset_count(cookies, device_id):
    """测试重置验证次数"""
    response = requests.post(f"{ADMIN_URL}/devices/{device_id}/reset-count", cookies=cookies)
    if response.status_code == 200:
        print(f"✓ 重置验证次数成功")
        return True
    else:
        print(f"✗ 重置失败: {response.text}")
        return False


def test_delete_device(cookies, device_id):
    """测试删除设备"""
    response = requests.delete(f"{ADMIN_URL}/devices/{device_id}", cookies=cookies)
    if response.status_code == 200:
        print(f"✓ 删除设备成功: {device_id}")
        return True
    else:
        print(f"✗ 删除失败: {response.text}")
        return False


def run_full_test():
    """运行完整测试流程"""
    print("=" * 60)
    print("设备验证签名HTTP接口测试")
    print("=" * 60)
    print()
    
    cookies = login_admin()
    if not cookies:
        print("无法登录，测试终止")
        return
    
    test_device_id = "http-test-device-002"
    
    print("\n--- 1. 创建设备 ---")
    test_create_device(cookies, test_device_id, 100)
    
    print("\n--- 2. 获取设备列表 ---")
    test_get_devices(cookies)
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

    print("\n--- 3. 获取密钥 ---")
    keys = test_get_device_keys(cookies, test_device_id)
    import base64
    print("\n--- 4. 调用验证接口生成签名 (3次) ---")
    from cryptography.hazmat.primitives import serialization
    pub_key = Ed25519PublicKey.from_public_bytes(base64.b64decode(keys["public_key"]))
    signatures = []
    for i in range(3):
        result = test_verify_device(test_device_id)
        if result:
            signature = result.get("signature")
            print(f"\n第 {i + 1} 次验证:{signature}")
            pub_key.verify(base64.b64decode(signature), canonical_message(test_device_id, result.get("issued_at")))
            print("成功验证 可以放行")
            signatures.append(result)
    
    print("\n--- 5. 获取公钥（公开接口） ---")
    public_key = test_get_public_key(test_device_id)

    print("\n--- 6. 查看验证日志 ---")
    test_get_verification_logs(cookies, test_device_id)
    
    print("\n--- 7. 验证签名一致性 ---")
    if keys and signatures:
        print(f"公钥一致: {keys['public_key'] == public_key}")
    
    print("\n--- 8. 重置验证次数 ---")
    test_reset_count(cookies, test_device_id)
    
    print("\n--- 9. 清理测试设备 ---")
    test_delete_device(cookies, test_device_id)
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)


def canonical_message(device_id: str, issued_at_unix: int) -> bytes:
    """
    构造规范化的验证消息

    参数:
        device_id: 设备ID
        issued_at_unix: 签发时间的Unix时间戳

    返回:
        bytes: 规范化消息字节

    格式:
        "device_id|issued_at_unix"
    """
    return f"{device_id}|{issued_at_unix}".encode("utf-8")


def test_quota_exhaustion():
    """测试配额耗尽"""
    print("\n" + "=" * 60)
    print("测试配额耗尽")
    print("=" * 60)
    
    cookies = login_admin()
    if not cookies:
        return
    
    test_device_id = "quota-test-device"
    
    print("\n创建配额为2的设备...")
    test_create_device(cookies, test_device_id, 2)
    
    print("\n第1次验证:")
    test_verify_device(test_device_id)
    
    print("\n第2次验证:")
    test_verify_device(test_device_id)
    
    print("\n第3次验证（应该失败）:")
    test_verify_device(test_device_id)
    
    print("\n清理...")
    test_delete_device(cookies, test_device_id)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "quota":
            test_quota_exhaustion()
        elif sys.argv[1] == "verify":
            device_id = sys.argv[2] if len(sys.argv) > 2 else "test-device"
            test_verify_device(device_id)
        elif sys.argv[1] == "keys":
            device_id = sys.argv[2] if len(sys.argv) > 2 else "test-device"
            cookies = login_admin()
            if cookies:
                test_get_device_keys(cookies, device_id)
        elif sys.argv[1] == "logs":
            device_id = sys.argv[2] if len(sys.argv) > 2 else "test-device"
            cookies = login_admin()
            if cookies:
                test_get_verification_logs(cookies, device_id)
    else:
        run_full_test()