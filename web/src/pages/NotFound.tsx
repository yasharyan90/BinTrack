import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Nothing at this address"
      description="Even bins get misplaced. Head back and try again."
      action={
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      }
      className="mt-12"
    />
  )
}
