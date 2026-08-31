// Shared media vocabulary — kept in one place so the grid, modal, filters and
// tables can't drift apart. Values match the backend's MediaType enum.

export const VIDEO_TYPES = new Set([
  'post_video',
  'carousel_video',
  'reel',
  'story_video',
  'archive_video',
])

export const TYPE_ICON = {
  post_image: 'ri-image-line',
  post_video: 'ri-play-circle-line',
  carousel_image: 'ri-stack-line',
  carousel_video: 'ri-stack-line',
  reel: 'ri-film-line',
  story_image: 'ri-history-line',
  story_video: 'ri-history-line',
  archive_image: 'ri-archive-line',
  archive_video: 'ri-archive-line',
}

export const TYPE_LABEL = {
  post_image: 'Post image',
  post_video: 'Post video',
  carousel_image: 'Carousel image',
  carousel_video: 'Carousel video',
  reel: 'Reel',
  story_image: 'Story image',
  story_video: 'Story video',
  archive_image: 'Archived story (image)',
  archive_video: 'Archived story (video)',
}

// Media Library tabs. `key` matches the backend MediaCategory enum.
export const CATEGORIES = [
  { key: '', label: 'All', icon: 'ri-apps-2-line' },
  { key: 'post', label: 'Posts', icon: 'ri-image-2-line' },
  { key: 'reel', label: 'Reels', icon: 'ri-film-line' },
  { key: 'story', label: 'Stories', icon: 'ri-history-line' },
  { key: 'archive', label: 'Archive', icon: 'ri-archive-line' },
]

export const MEDIA_TYPE_OPTIONS = [
  ['', 'All types'],
  ...Object.entries(TYPE_LABEL).map(([value, label]) => [value, label]),
]

export const JOB_LABEL = {
  sync_profile: 'Sync profile',
  download_posts: 'Download posts',
  download_reels: 'Download reels',
  download_stories: 'Download stories',
  download_single_post: 'Download single post',
  discover_posts: 'Fetch post list',
  discover_reels: 'Fetch reel list',
  discover_stories: 'Fetch story list',
  download_selected: 'Download selected',
  discover_archive: 'Fetch archive list',
  download_archive: 'Download archived stories',
}

export function formatBytes(bytes) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}
