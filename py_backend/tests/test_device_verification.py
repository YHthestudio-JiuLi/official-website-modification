"""
设备验证（指纹 + 平台签名）单元测试。
"""
from __future__ import annotations

import base64
import os
import sqlite3
import tempfile
import unittest

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

from py_backend.modules.device_verification import DeviceVerificationManager
from py_backend.modules.device_verification_crypto import PlatformSigningCrypto
from py_backend.modules.device_verification_errors import DeviceVerificationError, QUOTA_EXHAUSTED


TEST_FINGERPRINT = "a" * 128


def _generate_platform_key_b64() -> str:
    private_key = Ed25519PrivateKey.generate()
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return base64.b64encode(private_bytes).decode("ascii")


class TestFingerprintVerificationFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp()
        cls.db_path = os.path.join(cls.temp_dir, "test.db")
        cls.conn = sqlite3.connect(cls.db_path)
        cls.conn.row_factory = sqlite3.Row
        cls.manager = DeviceVerificationManager(cls.conn)
        cls.manager.create_table()
        cls.manager.update_settings(signing_private_key_b64=_generate_platform_key_b64())

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        import shutil
        shutil.rmtree(cls.temp_dir)

    def test_verify_then_confirm_increments_count(self):
        device_id = "fp-flow-device"
        self.manager.create(
            device_id,
            max_verifications=3,
            is_whitelisted=True,
            device_fingerprint=TEST_FINGERPRINT,
            fingerprint_algo_version="3",
        )

        verify_result = self.manager.verify_device(
            fingerprint=TEST_FINGERPRINT,
            fingerprint_algo_version="3",
        )
        row_after_verify = self.manager.find_by_device_id(device_id)
        self.assertEqual(int(row_after_verify["verification_count"]), 0)

        confirm_result = self.manager.confirm_verification(
            TEST_FINGERPRINT,
            int(verify_result["issued_at"]),
            verify_result["signature"],
        )
        self.assertFalse(confirm_result.get("already_counted"))
        self.assertEqual(int(confirm_result["verification_count"]), 1)

        confirm_again = self.manager.confirm_verification(
            TEST_FINGERPRINT,
            int(verify_result["issued_at"]),
            verify_result["signature"],
        )
        self.assertTrue(confirm_again.get("already_counted"))

    def test_quota_checked_on_confirm(self):
        device_id = "fp-quota-device"
        self.manager.create(
            device_id,
            max_verifications=1,
            is_whitelisted=True,
            device_fingerprint="b" * 128,
            fingerprint_algo_version="3",
        )
        first = self.manager.verify_device(fingerprint="b" * 128, fingerprint_algo_version="3")
        self.manager.confirm_verification("b" * 128, int(first["issued_at"]), first["signature"])

        with self.assertRaises(DeviceVerificationError) as ctx:
            self.manager.verify_device(fingerprint="b" * 128, fingerprint_algo_version="3")
        self.assertEqual(ctx.exception.code, QUOTA_EXHAUSTED)


if __name__ == "__main__":
    unittest.main()
