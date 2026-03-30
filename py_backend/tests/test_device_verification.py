"""
设备验证签名测试类
测试签名生成和验证功能
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import sqlite3
import tempfile
import unittest
from py_backend.modules.device_verification import DeviceVerificationManager


class TestDeviceVerification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp()
        cls.db_path = os.path.join(cls.temp_dir, "test.db")
        cls.conn = sqlite3.connect(cls.db_path)
        cls.conn.row_factory = sqlite3.Row
        cls.manager = DeviceVerificationManager(cls.conn)
        cls.manager.create_table()

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        import shutil
        shutil.rmtree(cls.temp_dir)

    def test_01_create_device(self):
        """测试创建设备"""
        device = self.manager.create("test-device-001", max_verifications=100)
        self.assertIsNotNone(device)
        self.assertEqual(device["device_id"], "test-device-001")
        self.assertEqual(device["max_verifications"], 100)
        self.assertEqual(device["verification_count"], 0)
        print(f"✓ 创建设备成功: {device['device_id']}")

    def test_02_get_keys(self):
        """测试获取密钥"""
        keys = self.manager.get_keys("test-device-001")
        self.assertIsNotNone(keys)
        self.assertIn("public_key", keys)
        self.assertIn("private_key", keys)
        self.assertTrue(len(keys["public_key"]) > 0)
        self.assertTrue(len(keys["private_key"]) > 0)
        print(f"✓ 获取公钥: {keys['public_key'][:30]}...")
        print(f"✓ 获取私钥: {keys['private_key'][:30]}...")

    def test_03_verify_device(self):
        """测试设备验证（签名生成）"""
        result = self.manager.verify_device("test-device-001", "192.168.1.100", "TestAgent/1.0")
        self.assertIsNotNone(result)
        self.assertEqual(result["device_id"], "test-device-001")
        self.assertIn("issued_at", result)
        self.assertIn("signature", result)
        print(f"✓ 签名生成成功: issued_at={result['issued_at']}")
        print(f"  签名: {result['signature'][:40]}...")

    def test_04_verify_signature(self):
        """测试签名验证"""
        result = self.manager.verify_device("test-device-001", "192.168.1.101", "TestAgent/2.0")
        is_valid = self.manager.verify_signature(
            result["device_id"],
            result["signature"],
            result["issued_at"]
        )
        self.assertTrue(is_valid)
        print(f"✓ 签名验证成功")

    def test_05_invalid_signature(self):
        """测试无效签名"""
        is_valid = self.manager.verify_signature(
            "test-device-001",
            "invalid_signature_base64",
            1234567890
        )
        self.assertFalse(is_valid)
        print(f"✓ 无效签名正确被拒绝")

    def test_06_verification_count(self):
        """测试验证计数"""
        device = self.manager.find_by_device_id("test-device-001")
        self.assertIsNotNone(device)
        count_before = device["verification_count"]
        
        self.manager.verify_device("test-device-001")
        
        device = self.manager.find_by_device_id("test-device-001")
        self.assertEqual(device["verification_count"], count_before + 1)
        print(f"✓ 验证计数正确: {count_before} -> {device['verification_count']}")

    def test_07_quota_exhausted(self):
        """测试配额耗尽"""
        small_device = self.manager.create("test-quota", max_verifications=2)
        
        self.manager.verify_device("test-quota")
        self.manager.verify_device("test-quota")
        
        with self.assertRaises(ValueError) as context:
            self.manager.verify_device("test-quota")
        
        self.assertIn("quota exhausted", str(context.exception))
        print(f"✓ 配额耗尽正确触发异常")

    def test_08_reset_count(self):
        """测试重置验证次数"""
        self.manager.reset_verification_count("test-device-001")
        device = self.manager.find_by_device_id("test-device-001")
        self.assertEqual(device["verification_count"], 0)
        print(f"✓ 验证次数重置成功")

    def test_09_verification_logs(self):
        """测试验证日志"""
        device_id = "test-logs-device"
        self.manager.create(device_id, 100)
        
        for i in range(3):
            self.manager.verify_device(device_id, f"10.0.0.{i}", f"Agent/{i}")
        
        logs = self.manager.find_logs_by_device_id(device_id)
        self.assertEqual(len(logs), 3)
        
        for i, log in enumerate(logs):
            self.assertEqual(log["device_id"], device_id)
            self.assertIsNotNone(log["signature"])
            self.assertIsNotNone(log["issued_at"])
            print(f"✓ 日志 {i+1}: IP={log['ip_address']}, Time={log['created_at']}")

    def test_10_delete_device(self):
        """测试删除设备"""
        device_id = "test-delete-device"
        self.manager.create(device_id)
        self.manager.verify_device(device_id)
        
        self.manager.delete(device_id)
        
        device = self.manager.find_by_device_id(device_id)
        self.assertIsNone(device)
        
        logs = self.manager.find_logs_by_device_id(device_id)
        self.assertEqual(len(logs), 0)
        print(f"✓ 设备及其日志删除成功")


class TestSignatureVerification(unittest.TestCase):
    """签名验证详细测试"""
    
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp()
        cls.db_path = os.path.join(cls.temp_dir, "test.db")
        cls.conn = sqlite3.connect(cls.db_path)
        cls.conn.row_factory = sqlite3.Row
        cls.manager = DeviceVerificationManager(cls.conn)
        cls.manager.create_table()

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        import shutil
        shutil.rmtree(cls.temp_dir)

    def test_cross_device_signature(self):
        """测试跨设备签名验证（应该失败）"""
        device1 = "cross-test-1"
        device2 = "cross-test-2"
        
        self.manager.create(device1, 10)
        self.manager.create(device2, 10)
        
        result1 = self.manager.verify_device(device1)
        
        is_valid = self.manager.verify_signature(device2, result1["signature"], result1["issued_at"])
        self.assertFalse(is_valid)
        print(f"✓ 跨设备签名验证正确失败")

    def test_tampered_issued_at(self):
        """测试篡改时间戳（应该失败）"""
        device_id = "tamper-test"
        self.manager.create(device_id, 10)
        
        result = self.manager.verify_device(device_id)
        
        is_valid = self.manager.verify_signature(device_id, result["signature"], result["issued_at"] + 1)
        self.assertFalse(is_valid)
        print(f"✓ 篡改时间戳后签名验证正确失败")

    def test_tampered_signature(self):
        """测试篡改签名（应该失败）"""
        device_id = "tamper-sig-test"
        self.manager.create(device_id, 10)
        
        result = self.manager.verify_device(device_id)
        tampered_sig = result["signature"][:-5] + "AAAA"
        
        is_valid = self.manager.verify_signature(device_id, tampered_sig, result["issued_at"])
        self.assertFalse(is_valid)
        print(f"✓ 篡改签名后验证正确失败")


def run_tests():
    print("=" * 60)
    print("设备验证签名测试")
    print("=" * 60)
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestDeviceVerification))
    suite.addTests(loader.loadTestsFromTestCase(TestSignatureVerification))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "=" * 60)
    if result.wasSuccessful():
        print("✓ 所有测试通过!")
    else:
        print(f"✗ 测试失败: {len(result.failures)} failures, {len(result.errors)} errors")
    print("=" * 60)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    run_tests()