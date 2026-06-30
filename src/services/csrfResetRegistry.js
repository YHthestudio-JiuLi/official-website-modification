let resetApiCsrfImpl = () => {}
let resetV2CsrfImpl = () => {}

export function registerApiCsrfReset(fn) {
  resetApiCsrfImpl = typeof fn === 'function' ? fn : () => {}
}

export function registerV2CsrfReset(fn) {
  resetV2CsrfImpl = typeof fn === 'function' ? fn : () => {}
}

export function runApiCsrfReset() {
  resetApiCsrfImpl()
}

export function runV2CsrfReset() {
  resetV2CsrfImpl()
}

export function resetAllCsrfState() {
  runApiCsrfReset()
  runV2CsrfReset()
}
