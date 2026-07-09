# PyInstaller 运行时钩子：在加载混淆模块前先初始化 PyArmor 运行时
import sys

if getattr(sys, "frozen", False):
    try:
        import pyarmor_runtime_000000  # noqa: F401
    except ImportError:
        pass
