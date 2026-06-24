import v2 from '@/services/v2/http'
import {
  saveLegacyNodeBridgeToken,
  getLegacyNodeBridgeToken,
  establishNodeAdminWithToken
} from '@/utils/legacyNodeSession'

/**
 * 大文件分片上传前：换取 bridge token 并在 Node 建立 admin 会话（分片直连 Node，不经 Laravel 二次落盘）
 */
export async function prepareLegacyNodeUpload() {
  let token = getLegacyNodeBridgeToken()
  if (!token) {
    const { data } = await v2.post('/auth/admin/legacy-node-bridge')
    token = data?.token
    if (!token) {
      throw new Error('无法获取上传桥接令牌，请重新登录后台')
    }
    saveLegacyNodeBridgeToken(token)
  }
  try {
    await establishNodeAdminWithToken(token)
  } catch {
    const { data } = await v2.post('/auth/admin/legacy-node-bridge')
    if (data?.token) {
      saveLegacyNodeBridgeToken(data.token)
      await establishNodeAdminWithToken(data.token)
    }
  }
}
