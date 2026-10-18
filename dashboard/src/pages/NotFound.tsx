import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Card, EmptyState } from '../components/ui'

export default function NotFound() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="That page doesn't exist."
        action={<Link to="/" className="btn-primary">Back to Overview</Link>}
      />
    </Card>
  )
}
