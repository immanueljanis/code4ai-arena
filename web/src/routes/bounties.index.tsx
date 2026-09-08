import { createFileRoute } from '@tanstack/react-router'
import { BountiesPage } from '../components/pages/Bounties'

export const Route = createFileRoute('/bounties/')({ component: BountiesPage })
