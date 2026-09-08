import { Skeleton } from '../ui'

const line = 'border-0 bg-surface/60'

/** Placeholder layout shown while the arena data loads — mirrors the real 3-column grid. */
export function ArenaSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="flex flex-col gap-3">
        <Skeleton className={`h-3.5 w-40 ${line}`} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </aside>

      <section className="flex flex-col gap-4">
        <Skeleton className={`h-7 w-56 ${line}`} />
        <Skeleton className={`h-4 w-full max-w-md ${line}`} />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-44 w-full" />
      </section>

      <aside className="flex flex-col gap-7">
        <div className="flex flex-col gap-2.5">
          <Skeleton className={`h-3.5 w-28 ${line}`} />
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className={`h-11 ${line}`} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className={`h-3.5 w-28 ${line}`} />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={`h-7 ${line}`} />
          ))}
        </div>
      </aside>
    </div>
  )
}
