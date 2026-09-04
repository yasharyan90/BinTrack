import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * One boundary around the shell so a broken page never takes the whole app
 * with it (TRD §9). Reloading is the honest recovery: the query cache and the
 * realtime socket both rebuild cleanly from scratch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BinTrack] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <AlertOctagon className="mx-auto size-10 text-destructive" strokeWidth={1.5} aria-hidden />
          <div className="space-y-1">
            <h1 className="text-h2">Something broke on this screen</h1>
            <p className="text-sm text-muted-foreground">
              Your stock data is safe — nothing was written. Reload to carry on.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-left text-small">
            {this.state.error.message}
          </pre>
          <Button onClick={() => window.location.reload()}>
            <RotateCw />
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
