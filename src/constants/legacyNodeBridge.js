/** sessionStorage 中 Laravel 签发的 Node bridge token 键名 */
export const LEGACY_NODE_BRIDGE_TOKEN_KEY = 'yh_legacy_node_bridge_token'

/** 读取 bridge token，供 Node legacy API 请求头使用（反代 Cookie 失效时的兜底） */
export function readLegacyNodeBridgeToken() {
  try {
    return sessionStorage.getItem(LEGACY_NODE_BRIDGE_TOKEN_KEY) || null
  } catch {
    return null
  }
}
