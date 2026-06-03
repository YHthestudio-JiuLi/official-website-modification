/** 首页/品牌标题，与 index.html <title> 保持一致，便于搜索引擎收录 */
export const SITE_HOME_TITLE = 'YHthestudio | Official'

/**
 * 根据路由 meta 设置浏览器标题
 * 首页使用品牌全称，子页使用「页面名 - YHthestudio」
 */
export function setDocumentTitle(route, t) {
  const titleKey = route?.meta?.titleKey
  if (titleKey === 'titles.home') {
    document.title = SITE_HOME_TITLE
    return
  }
  const pageTitle =
    typeof titleKey === 'string' && titleKey
      ? t(titleKey)
      : typeof route?.meta?.title === 'string' && route.meta.title
        ? route.meta.title
        : t('titles.fallback')
  document.title = `${pageTitle} - YHthestudio`
}
