from __future__ import annotations

import secrets
import string

# 订单号随机段字符集：大小写字母 + 数字
_ORDER_NO_CHARSET = string.ascii_letters + string.digits


def category_code(slug: str | None, name: str | None = None) -> str:
    """从分类 slug 或名称提取 1 位编码（ASCII 字母或数字，统一大写）"""
    for source in (slug, name):
        if not source:
            continue
        text = str(source).strip()
        for ch in text:
            if ch.isascii() and ch.isalnum():
                return ch.upper()
    return "X"


def random_order_suffix(length: int = 6) -> str:
    """生成指定长度的随机字母数字串"""
    return "".join(secrets.choice(_ORDER_NO_CHARSET) for _ in range(length))


def build_order_no(
    primary_slug: str | None,
    secondary_slug: str | None,
    primary_name: str | None = None,
    secondary_name: str | None = None,
) -> str:
    """一级分类码 + 二级分类码 + 6 位随机 = 8 位订单号"""
    prefix = category_code(primary_slug, primary_name) + category_code(
        secondary_slug, secondary_name
    )
    return prefix + random_order_suffix(6)
