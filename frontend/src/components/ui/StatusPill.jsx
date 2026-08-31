// Maps a job/media status onto the theme's coloured pill styles.
const VARIANT = {
  pending: 'muted',
  running: 'info',
  success: 'success',
  failed: 'danger',
  private: 'warning',
}

export default function StatusPill({ status, variant, children }) {
  const resolved = variant || VARIANT[status] || 'muted'
  return <span className={`pill pill--${resolved}`}>{children || status}</span>
}
