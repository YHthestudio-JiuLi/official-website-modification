/**
 * 子序列模糊：关键词每个字符在目标串中按顺序出现即命中（如「数系」可匹配「数据分析系统」）
 */
export function fuzzySubsequenceMatch(needle, haystack) {
  if (needle == null || typeof needle !== 'string') return true
  if (haystack == null || haystack === '') return false
  const n = needle.toLowerCase().replace(/\s+/g, '')
  const h = String(haystack).toLowerCase()
  if (!n) return true
  let j = 0
  for (let i = 0; i < h.length && j < n.length; i++) {
    if (h[i] === n[j]) j++
  }
  return j === n.length
}

/**
 * 商品是否匹配搜索：连续子串优先，否则对名称/描述做子序列模糊
 */
export function productMatchesSearch(product, queryRaw) {
  const raw = String(queryRaw || '').trim().toLowerCase()
  if (!raw) return true
  const name = String(product.name || '').toLowerCase()
  const desc = String(product.description || '').toLowerCase()
  if (name.includes(raw) || desc.includes(raw)) return true
  return fuzzySubsequenceMatch(raw, product.name || '') || fuzzySubsequenceMatch(raw, product.description || '')
}
