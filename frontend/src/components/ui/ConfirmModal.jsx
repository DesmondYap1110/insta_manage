import useScrollLock from '../../hooks/useScrollLock'
import useEscapeKey from '../../hooks/useEscapeKey'

/**
 * Themed replacement for the browser's native window.confirm().
 *
 * Native confirm() blocks the JS thread, can't be styled, and is suppressed
 * entirely in some embedded/automated browsers — which made destructive
 * actions silently do nothing. This renders in-app instead.
 */
export default function ConfirmModal({
  open,
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  // Close on Escape, and stop the page behind the modal from scrolling.
  // The scroll lock is reference-counted so stacking this on top of
  // MediaModal releases correctly when both close.
  useScrollLock(open)
  useEscapeKey(open, onCancel)

  if (!open) return null

  return (
    <div className="media-modal" onClick={onCancel}>
      <div
        className="media-modal__dialog"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="media-modal__head">
          <p className="media-modal__title">{title}</p>
          <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" />
        </div>
        <div className="media-modal__body">
          <p className="mb-0" style={{ fontSize: 'var(--fs-sm)' }}>
            {message}
          </p>
        </div>
        <div className="media-modal__foot">
          <button type="button" className="btn-gen btn-gen--neutral btn-gen--sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn-gen btn-gen--${variant} btn-gen--sm`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
