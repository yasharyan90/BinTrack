import { create } from 'zustand'
import type { ConnectionStatus } from '@/lib/realtime'

/** Cross-cutting UI state: sidebar, the global scanner sheet, socket health. */
type UiState = {
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  scannerOpen: boolean
  openScanner: () => void
  closeScanner: () => void

  searchOpen: boolean
  setSearchOpen: (open: boolean) => void

  connection: ConnectionStatus
  setConnection: (status: ConnectionStatus) => void

  queuedScans: number
  setQueuedScans: (n: number) => void
}

const SIDEBAR_KEY = 'bt-sidebar-collapsed'

export const useUi = create<UiState>((set) => ({
  sidebarCollapsed:
    typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_KEY) === '1',
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return { sidebarCollapsed: next }
    }),

  scannerOpen: false,
  openScanner: () => set({ scannerOpen: true }),
  closeScanner: () => set({ scannerOpen: false }),

  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),

  connection: 'connecting',
  setConnection: (connection) => set({ connection }),

  queuedScans: 0,
  setQueuedScans: (queuedScans) => set({ queuedScans }),
}))
