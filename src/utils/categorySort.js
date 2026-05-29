/**
 * 分类列表按 sortOrder 升序（越小越靠前），相同则按 id
 */
export function sortCategories(list) {
  if (!Array.isArray(list)) return []
  return [...list].sort(
    (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || a.id - b.id
  )
}

/** 一级分类（无 parentId） */
export function getParentCategories(categories) {
  return sortCategories((categories || []).filter((c) => !c.parentId))
}

/** 某一级分类下的二级分类 */
export function getSubCategories(categories, parentId) {
  return sortCategories((categories || []).filter((c) => c.parentId === parentId))
}
