import { useCallback } from 'react'
import { toast } from 'sonner'
import { parseError } from '@/lib/errors'

/**
 * One place that turns an RPC failure into a message a picker can act on.
 * `INSUFFICIENT_STOCK:only 3 available in WH1-R01-B004` becomes
 * "Not enough stock — only 3 available in WH1-R01-B004".
 */
export function useAppToast() {
  const showError = useCallback((error: unknown, fallbackTitle?: string) => {
    const { title, message } = parseError(error)
    toast.error(fallbackTitle ?? title, { description: message })
  }, [])

  const showSuccess = useCallback((title: string, description?: string) => {
    toast.success(title, { description })
  }, [])

  const showInfo = useCallback((title: string, description?: string) => {
    toast(title, { description })
  }, [])

  const showWarning = useCallback((title: string, description?: string) => {
    toast.warning(title, { description })
  }, [])

  return { showError, showSuccess, showInfo, showWarning }
}
