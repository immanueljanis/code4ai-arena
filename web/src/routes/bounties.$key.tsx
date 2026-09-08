import { createFileRoute } from '@tanstack/react-router'
import { BountyDetailPage } from '../components/pages/BountyDetail'

export const Route = createFileRoute('/bounties/$key')({ component: RouteComponent })

function RouteComponent() {
  const { key } = Route.useParams()
  return <BountyDetailPage bountyKey={key} />
}
