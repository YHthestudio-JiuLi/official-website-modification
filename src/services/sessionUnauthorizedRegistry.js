let adminUnauthorizedHandler = () => {}
let userUnauthorizedHandler = () => {}

export function registerAdminUnauthorizedHandler(fn) {
  adminUnauthorizedHandler = typeof fn === 'function' ? fn : () => {}
}

export function registerUserUnauthorizedHandler(fn) {
  userUnauthorizedHandler = typeof fn === 'function' ? fn : () => {}
}

export function notifyAdminUnauthorized(url) {
  adminUnauthorizedHandler(url)
}

export function notifyUserUnauthorized(url) {
  userUnauthorizedHandler(url)
}
