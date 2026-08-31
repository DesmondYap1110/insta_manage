import { get, post } from './client'

export const startLogin = () => post('/api/auth/instagram/login')
export const getLoginStatus = (loginSessionId) =>
  get(`/api/auth/instagram/login/${loginSessionId}/status`)
export const getCurrentSession = () => get('/api/auth/instagram/session')
export const logout = () => post('/api/auth/instagram/logout')
