import { createFileRoute } from '@tanstack/react-router'
import { Arena } from '../components/arena'

export const Route = createFileRoute('/arena')({
  component: ArenaRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    target: typeof search.target === 'string' ? search.target : undefined,
  }),
})

function ArenaRoute() {
  const { target } = Route.useSearch()
  return <Arena initialTarget={target} />
}
