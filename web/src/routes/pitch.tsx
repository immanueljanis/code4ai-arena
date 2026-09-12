import { createFileRoute } from '@tanstack/react-router'
import { Pitch } from '../components/pitch'

export const Route = createFileRoute('/pitch')({ component: Pitch })
