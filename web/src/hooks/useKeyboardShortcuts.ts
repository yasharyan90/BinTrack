import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUi } from '@/stores/ui'

/**
 * Global keys (UI/UX §7): `/` focuses search, `s` opens the scanner.
 * Keys never fire while a field has focus — a picker typing a lot number is
 * not asking for the camera.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate()
  const { setSearchOpen, openScanner } = useUi()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        openScanner()
      } else if (event.key.toLowerCase() === 'g') {
        // `g` then `h` — go home, vim-style.
        const next = (e2: KeyboardEvent) => {
          if (e2.key.toLowerCase() === 'h') navigate('/')
          window.removeEventListener('keydown', next)
        }
        window.addEventListener('keydown', next, { once: true })
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, openScanner, setSearchOpen])
}
