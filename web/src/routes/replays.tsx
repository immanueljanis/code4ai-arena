import { createFileRoute } from '@tanstack/react-router'
import { ReplaysPage } from '../components/pages/Replays'

export const Route = createFileRoute('/replays')({ component: ReplaysPage })
