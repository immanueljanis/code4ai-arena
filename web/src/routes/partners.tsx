import { createFileRoute } from '@tanstack/react-router'
import { PartnersPage } from '../components/pages/Partners'

export const Route = createFileRoute('/partners')({ component: PartnersPage })
