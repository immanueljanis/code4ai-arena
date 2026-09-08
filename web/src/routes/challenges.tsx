import { createFileRoute } from '@tanstack/react-router'
import { ChallengesPage } from '../components/pages/Challenges'

export const Route = createFileRoute('/challenges')({ component: ChallengesPage })
