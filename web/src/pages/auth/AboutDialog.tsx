import { Bell, Boxes, ListOrdered, PackagePlus, ScanLine, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const FLOW = [
  {
    icon: PackagePlus,
    title: 'Receive',
    text: 'Scan the destination bin, enter lot and expiry, and the stock gets an address.',
    code: 'WH1-R02-B017',
  },
  {
    icon: Search,
    title: 'Search',
    text: 'Type a name, SKU or barcode — typos included — and see every bin and quantity in under a second.',
  },
  {
    icon: ListOrdered,
    title: 'Order',
    text: 'Create an order. Allocation is first-expired-first-out, returns the exact bins in walking order, and reserves the stock so two orders never claim the same unit.',
  },
  {
    icon: ScanLine,
    title: 'Pick',
    text: 'Scan the bin QR, then the product barcode. A wrong bin or an expired lot is blocked. Confirm the quantity and the stock moves, with a movement record written.',
  },
  {
    icon: Bell,
    title: 'Watch',
    text: 'The admin dashboard updates live: KPIs, stock by row, a bin heat-map, and alerts for low stock, expiring lots and pick discrepancies.',
  },
]

/**
 * What BinTrack is and how a unit of stock moves through it, for someone who
 * has landed on the sign-in page without the README to hand.
 */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>About BinTrack</DialogTitle>
          <DialogDescription>
            Multi-warehouse inventory and location tracking, built on Supabase and React.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          <section className="space-y-1.5">
            <h2 className="text-h3">The problem</h2>
            <p className="text-muted-foreground">
              Orders arrive, but staff don&rsquo;t know which row or bin holds the item. They walk
              the floor, pick the wrong variant, ship stock that has already expired, and admins
              find out about a stock-out only when an order fails. BinTrack gives every unit an
              address, verifies every pick with a scan, and raises problems before they cost money.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-h3">How a unit moves through it</h2>
            <ol className="space-y-3">
              {FLOW.map(({ icon: Icon, title, text, code }, index) => (
                <li key={title} className="flex gap-3">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-small font-semibold tabular"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                      {title}
                    </p>
                    <p className="text-muted-foreground">
                      {text}
                      {code && (
                        <>
                          {' '}
                          <span className="location-code rounded border border-border bg-muted/60 px-1.5 py-0.5 text-small">
                            {code}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <h2 className="text-h3">Warehouse staff</h2>
              <p className="text-muted-foreground">
                Search, receive, transfer between bins, and work the pick list with the scanner.
              </p>
            </div>
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <h2 className="text-h3">Inventory admin</h2>
              <p className="text-muted-foreground">
                Everything staff can do, plus the live dashboard, alerts, catalogue and locations,
                CSV import and export, cycle counts, labels, users and thresholds.
              </p>
            </div>
          </section>

          <section className="space-y-1.5">
            <h2 className="flex items-center gap-1.5 text-h3">
              <Boxes className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              Under the hood
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Supabase Postgres, with row-level security as the boundary — a staff account is
                refused admin actions by the database itself, not just by hidden buttons.
              </li>
              <li>
                Every stock change goes through one transactional function that updates the level,
                writes the movement log and re-evaluates alerts together.
              </li>
              <li>Live updates over WebSockets; CSV import, label PDFs and digests as Edge Functions.</li>
              <li>
                A React PWA that works with the phone camera or a USB barcode scanner, in light
                and dark mode.
              </li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
