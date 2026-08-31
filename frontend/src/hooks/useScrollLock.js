import { useEffect } from 'react'

/**
 * Reference-counted page scroll lock.
 *
 * Why a shared counter instead of each modal saving/restoring the style
 * itself: modals stack. Opening the delete confirmation on top of the media
 * viewer meant the inner modal captured the OUTER one's `overflow: hidden` as
 * its "previous" value and restored that on close — leaving the page
 * permanently unscrollable after a delete.
 *
 * The original value is captured once, on the first lock, and restored only
 * when the last lock is released.
 */
let lockCount = 0
let savedOverflow = ''

function lock() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
}

function unlock() {
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow
    savedOverflow = ''
  }
}

export default function useScrollLock(active) {
  // `active` is the ONLY dependency on purpose. Including callback props here
  // would re-run the effect on every parent render (inline arrows get a new
  // identity each time), churning the lock and losing the saved value.
  useEffect(() => {
    if (!active) return undefined
    lock()
    return unlock
  }, [active])
}
