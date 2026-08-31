import { del, get, post } from './client'

export const listDiscovered = (accountId, { mediaKind, downloaded, page = 1, pageSize = 60 } = {}) => {
  const params = new URLSearchParams({ page, page_size: pageSize })
  if (mediaKind) params.set('media_kind', mediaKind)
  if (downloaded !== undefined && downloaded !== null) params.set('downloaded', downloaded)
  return get(`/api/browse/${accountId}?${params.toString()}`)
}

export const startDiscover = (accountId, mediaKind, limit = 60) =>
  post(`/api/browse/${accountId}/discover`, { media_kind: mediaKind, limit })

export const downloadSelected = (accountId, discoveredIds, forceRedownload = false) =>
  post(`/api/browse/${accountId}/download-selected`, {
    discovered_ids: discoveredIds,
    force_redownload: forceRedownload,
  })

export const clearDiscovered = (accountId) => del(`/api/browse/${accountId}`)

export const thumbnailUrl = (accountId, discoveredId) =>
  `/api/browse/${accountId}/thumbnail/${discoveredId}`
