import { thumbnailUrl } from '../../api/browse'

// A tile in the browse grid. Clicking anywhere on it toggles selection —
// the whole card is the hit target, which matters when picking many items
// quickly. Already-downloaded items stay selectable so they can be
// re-downloaded on purpose, but are visually de-emphasised.
export default function SelectableMediaCard({ item, accountId, selected, onToggle, index }) {
  return (
    <div
      className={`sel-card${selected ? ' is-selected' : ''}${
        item.is_downloaded ? ' is-downloaded' : ''
      }`}
      onClick={(event) => onToggle(item.id, index, event)}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          onToggle(item.id, index, event)
        }
      }}
    >
      <div className="sel-card__frame">
        <img
          src={thumbnailUrl(accountId, item.id)}
          alt={item.caption || item.instagram_media_id}
          className="sel-card__thumb"
          loading="lazy"
        />

        <span className="sel-card__check">
          <i className="ri-check-line" />
        </span>

        <span className="sel-card__badges">
          {item.is_carousel && (
            <span className="sel-card__badge" title={`Carousel — ${item.item_count} items`}>
              <i className="ri-stack-line" /> {item.item_count}
            </span>
          )}
          {item.is_video && (
            <span className="sel-card__badge">
              <i className="ri-play-circle-line" />
            </span>
          )}
        </span>

        {item.is_downloaded && (
          <span className="sel-card__saved">
            <i className="ri-check-double-line" /> Saved
          </span>
        )}
      </div>

      <div className="sel-card__body">
        <p className="sel-card__caption">
          {item.caption || <span className="text-muted-soft">No caption</span>}
        </p>
        <div className="sel-card__meta">
          {item.taken_at ? new Date(item.taken_at).toLocaleDateString() : '—'}
        </div>
      </div>
    </div>
  )
}
