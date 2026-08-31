import { VIDEO_TYPES, TYPE_LABEL, formatBytes } from '../../constants/media'
import useScrollLock from '../../hooks/useScrollLock'
import useEscapeKey from '../../hooks/useEscapeKey'

export default function MediaModal({ item, onClose, onDelete }) {
  // Hooks must run on every render (React forbids conditional hooks), so the
  // early return for a null item comes after them.
  const isOpen = Boolean(item)
  useScrollLock(isOpen)
  useEscapeKey(isOpen, onClose)

  if (!item) return null

  const src = `/files/${item.file_path}`
  const isVideo = VIDEO_TYPES.has(item.media_type)

  return (
    <div className="media-modal" onClick={onClose}>
      <div className="media-modal__dialog" onClick={(e) => e.stopPropagation()}>
        <div className="media-modal__head">
          <p className="media-modal__title">{item.original_filename}</p>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
        </div>

        <div className="media-modal__body">
          {isVideo ? (
            <video src={src} controls className="media-modal__preview" />
          ) : (
            <img src={src} alt={item.original_filename} className="media-modal__preview" />
          )}

          {item.caption && (
            <p className="mt-3 mb-0" style={{ fontSize: 'var(--fs-sm)' }}>
              {item.caption}
            </p>
          )}

          <table className="meta-table">
            <tbody>
              <tr>
                <th>Media type</th>
                <td>{TYPE_LABEL[item.media_type] || item.media_type}</td>
              </tr>
              <tr>
                <th>Instagram media ID</th>
                <td>{item.instagram_media_id}</td>
              </tr>
              {item.shortcode && (
                <tr>
                  <th>Shortcode</th>
                  <td>{item.shortcode}</td>
                </tr>
              )}
              <tr>
                <th>Taken at</th>
                <td>{item.taken_at ? new Date(item.taken_at).toLocaleString() : '—'}</td>
              </tr>
              <tr>
                <th>Downloaded at</th>
                <td>{new Date(item.download_timestamp).toLocaleString()}</td>
              </tr>
              <tr>
                <th>Resolution</th>
                <td>{item.width && item.height ? `${item.width} × ${item.height}` : '—'}</td>
              </tr>
              <tr>
                <th>File size</th>
                <td>{formatBytes(item.file_size_bytes)}</td>
              </tr>
              <tr>
                <th>Stored file</th>
                <td>{item.file_path}</td>
              </tr>
              {item.source_url && (
                <tr>
                  <th>Source</th>
                  <td>
                    <a href={item.source_url} target="_blank" rel="noreferrer">
                      {item.source_url}
                    </a>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="media-modal__foot">
          <button
            type="button"
            className="btn-gen btn-gen--danger btn-gen--sm"
            onClick={() => onDelete(item)}
          >
            <i className="ri-delete-bin-6-line" />
            Delete
          </button>
          <a className="btn-gen btn-gen--sm" href={src} download={item.original_filename}>
            <i className="ri-download-2-line" />
            Download Original
          </a>
        </div>
      </div>
    </div>
  )
}
