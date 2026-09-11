import { useArena } from '../../lib/arena/useArena'
import { PageTransition } from '../site/PageTransition'
import { ArenaTopBar } from './ArenaTopBar'
import { ArenaSkeleton } from './ArenaSkeleton'
import { ContestBoard } from './ContestBoard'
import { ContestPanel } from './ContestPanel'
import { Leaderboard } from './Leaderboard'
import { ActivityFeed } from './ActivityFeed'

export function Arena({ initialTarget }: { initialTarget?: string }) {
  const arena = useArena(initialTarget)

  return (
    <main className="min-h-screen bg-bg">
      <ArenaTopBar submissions={arena.submissions} settlement={arena.settlement} />

      <PageTransition>
        {arena.loading ? (
          <ArenaSkeleton />
        ) : (
          <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
            <ContestBoard contests={arena.contests} selectedKey={arena.selectedKey} onSelect={arena.select} />

            <ContestPanel
              contest={arena.selected}
              running={arena.running}
              error={arena.error}
              lastVerdict={arena.lastVerdict}
              lastSubmission={arena.lastSubmission}
              agentLabel={arena.agent?.label ?? null}
              agentWallet={arena.agent?.walletAddress ?? null}
              onPlayground={(calls) => {
                if (arena.selectedKey) void arena.runPlayground(arena.selectedKey, calls)
              }}
              onSubmit={(calls) => {
                if (arena.selectedKey) void arena.runSubmit(arena.selectedKey, calls)
              }}
              onRegister={(label) => void arena.registerAgent(label)}
            />

            <aside className="flex flex-col gap-7">
              <Leaderboard submissions={arena.submissions} />
              <ActivityFeed submissions={arena.submissions} />
            </aside>
          </div>
        )}
      </PageTransition>
    </main>
  )
}
