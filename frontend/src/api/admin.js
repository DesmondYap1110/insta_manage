import { get, post } from './client'

// The password travels in the POST body only — never in the URL, never
// persisted anywhere on the client. The server replies with an httpOnly
// cookie that JavaScript cannot read.
export const adminLogin = (username, password) =>
  post('/api/admin/login', { username, password })

export const adminLogout = () => post('/api/admin/logout')
export const adminMe = () => get('/api/admin/me')

export const changePassword = (currentPassword, newPassword) =>
  post('/api/admin/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
