import { del, get, post } from './client'

export const listAccounts = () => get('/api/accounts')
export const getAccount = (id) => get(`/api/accounts/${id}`)
export const addAccount = (username) => post('/api/accounts', { username })
export const syncAccount = (id) => post(`/api/accounts/${id}/sync`)
export const deleteAccount = (id) => del(`/api/accounts/${id}`)
