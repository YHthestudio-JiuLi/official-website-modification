import v2 from './http'

export function fetchActivePopup() {
  return v2.get('/popup-notice')
}
