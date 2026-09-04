import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/stores/theme'

/** Bottom-right on desktop, top on mobile (UI/UX §5). */
export function Toaster() {
  const theme = useTheme((s) => s.theme)
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-popover text-popover-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          error: 'border-destructive/40',
          success: 'border-success/40',
          warning: 'border-warning/40',
        },
      }}
    />
  )
}
