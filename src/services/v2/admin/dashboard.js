import v2 from '../http'

export function fetchStats() {
  return v2.get('/admin/stats')
}
