/**
 * Element Plus 仅后台使用，进入管理端时再加载，减轻前台首屏体积
 */
let appRef = null
let installPromise = null

export function bindVueApp(app) {
  appRef = app
}

export function isElementPlusReady() {
  return isElementPlusInstalled()
}

function isElementPlusInstalled() {
  return Boolean(appRef?.config?.globalProperties?.$ELEMENT)
}

export function ensureElementPlus() {
  if (!appRef || isElementPlusInstalled()) {
    return Promise.resolve()
  }
  if (!installPromise) {
    installPromise = Promise.all([
      import('element-plus'),
      import('element-plus/dist/index.css'),
      import('@/styles/admin-element.css')
    ]).then(([ElementPlus]) => {
      appRef.use(ElementPlus.default)
    })
  }
  return installPromise
}
