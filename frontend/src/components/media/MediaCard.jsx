import { VIDEO_TYPES, TYPE_ICON } from '../../constants/media'

// We deliberately never re-encode downloaded media, so there is no generated
// poster image for videos. The `#t=0.1` media fragment makes the browser seek
// to 0.1s and paint that frame as the tile — without it `preload="metadata"`
// leaves the element blank and every video shows as a black square.
export default function MediaCard({ item, onClick, selectable = false, selected = false, onToggle }) {
  const src = `/files/${item.file_path}`
  const isVideo = VIDEO_TYPES.has(item.media_type)
  const posterSrc = isVideo ? `${src}#t=0.1` : src

  return (
    <div
      className={`media-card${selectable ? ' sel-card' : ''}${selected ? ' is-selected' : ''}`}
      onClick={selectable ? onToggle : onClick}
    >
      <div className="media-card__frame">
        {isVideo ? (
          <video src={posterSrc} className="media-thumb" muted playsInline preload="metadata" />
        ) : (
          <img
            src={src}
            alt={item.caption || item.original_filename}
            className="media-thumb"
            loading="lazy"
          />
        )}
        {selectable && (
          <span className="sel-card__check">
            <i className="ri-check-line" />
          </span>
        )}
        <span className="media-card__type">
          <i className={TYPE_ICON[item.media_type] || 'ri-file-line'} />
        </span>
      </div>
      <div className="media-card__body">
        <p className="media-card__caption">
          {item.caption || <span className="text-muted-soft">No caption</span>}
        </p>
        <div className="media-card__meta">
          {item.taken_at ? new Date(item.taken_at).toLocaleDateString() : '—'}
          {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
        </div>
      </div>
    </div>
  )
}
