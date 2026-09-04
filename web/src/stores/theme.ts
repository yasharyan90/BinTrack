import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'bt-theme'

function readStored(): Theme {
  if (typeof localStorage === 'undefined') return 'system'
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function apply(theme: Theme): void {
  if (typeof document === 'undefined') return
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  /** Re-applies on OS change while the user is on "system". */
  syncWithSystem: () => () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: readStored(),
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    apply(theme)
    set({ theme })
    // Best effort: remember the choice across devices (App Flow §2).
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      void supabase
        .from('profiles')
        .update({ preferences: { theme } })
        .eq('id', data.user.id)
    })
  },
  syncWithSystem: () => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (get().theme === 'system') apply('system')
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  },
}))

// Match the pre-paint script in index.html on first module evaluation.
apply(readStored())
