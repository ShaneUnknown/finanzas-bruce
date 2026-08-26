import { useEffect, useRef } from 'react'

/**
 * Adds an open dialog to the browser history so Android's system Back button
 * dismisses it before leaving the installed PWA.
 */
export const useBackDismiss = (isOpen: boolean, onDismiss: () => void) => {
  const isOpenRef = useRef(isOpen)
  const onDismissRef = useRef(onDismiss)
  const ownsHistoryEntryRef = useRef(false)

  isOpenRef.current = isOpen
  onDismissRef.current = onDismiss

  useEffect(() => {
    const handlePopState = () => {
      if (!isOpenRef.current || !ownsHistoryEntryRef.current) return

      ownsHistoryEntryRef.current = false
      onDismissRef.current()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (isOpen && !ownsHistoryEntryRef.current) {
      window.history.pushState({ ...window.history.state, dialogOpen: true }, '')
      ownsHistoryEntryRef.current = true
      return
    }

    if (!isOpen && ownsHistoryEntryRef.current) {
      ownsHistoryEntryRef.current = false
      window.history.back()
    }
  }, [isOpen])
}
