import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { queryClient } from '@/lib/queryClient'
import { AppRoutes } from '@/routes'
import { useAuth } from '@/stores/auth'

export default function App() {
  const initialise = useAuth((s) => s.initialise)

  useEffect(() => initialise(), [initialise])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
