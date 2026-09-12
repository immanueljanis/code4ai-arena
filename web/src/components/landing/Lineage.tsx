import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Reveal, SectionLabel, cn } from '../ui'
import { formatLoss, useExploitHistory, type ExploitRecord } from '../../lib/arena/useExploitHistory'
import { wrap } from './shared'

/* Rendered before the subgraph answers, and kept if it never does. */
const SEED: ExploitRecord[] = [
  {
    targetKey: 'reentrancy-vault',
    incident: 'The DAO',
    technique: 'recursive withdrawal before state update',
    lossUsd: '60000000',
    attackTx: '0x0ec3f2488a93839524add10ea229e773f6bc891b4eb4794c3337d4495263790b',
    blockNumber: '1718497',
    sourceUrl: 'https://blog.ethereum.org/2016/06/17/critical-update-re-dao-vulnerability',
  },
  {
    targetKey: 'access-control-vault',
    incident: 'Poly Network',
    technique: 'cross-chain access control failure',
    lossUsd: '611000000',
    attackTx: '0xb1f70464bd95b774c6ce60fc706eb5f9e35cb5f06e6cfe7c17dcda46ffd59581',
    blockNumber: '12996659',
    sourceUrl: 'https://medium.com/poly-network/honour-exploit-and-code-how-we-lost-610m-dollar-and-got-it-back-c4a7d0606267',
  },
  {
    targetKey: 'rounding-vault',
    incident: 'Resupply Finance',
    technique: 'first-depositor share inflation',
    lossUsd: '9600000',
    attackTx: '0xffbbd492e0605a8bb6d490c3cd879e87ff60862b0684160d08fd5711e7a872d3',
    blockNumber: '22785461',
    sourceUrl: 'https://crypto.training/hacks/2025-06-resupplyfi/',
  },
]

const shortTx = (tx: string) => `${tx.slice(0, 10)}…${tx.slice(-6)}`

export function Lineage() {
  const { records, live } = useExploitHistory(SEED)

  return (
    <section id="lineage" className="relative py-28">
      <div className={wrap}>
        <div className="flex flex-col items-center text-center">
          <SectionLabel>{live ? 'indexed from mainnet' : 'mainnet record'}</SectionLabel>
          <h2 className="mt-5 max-w-2xl text-3xl font-extrabold uppercase tracking-[-0.03em] text-balance sm:text-4xl">
            Every target is a hack that already happened.
          </h2>
          <p className="mt-5 max-w-[52ch] leading-relaxed text-muted text-pretty">
            The bug classes in the arena are not invented. Each one is reduced from a real Ethereum
            incident, indexed straight from mainnet so the transaction that broke it stays checkable.
          </p>
        </div>

        <Reveal className="mt-14">
          {/* A record table, because these are records. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  <th scope="col" className="py-3 pr-6 font-normal">Incident</th>
                  <th scope="col" className="py-3 pr-6 font-normal">Bug class</th>
                  <th scope="col" className="py-3 pr-6 text-right font-normal">Lost</th>
                  <th scope="col" className="py-3 pr-6 font-normal">Attack transaction</th>
                  <th scope="col" className="py-3 font-normal">Reproduced as</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.attackTx} className="border-b border-line/60 align-top">
                    <td className="py-5 pr-6">
                      <a
                        href={record.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm font-bold text-ink transition-colors hover:text-signal"
                      >
                        {record.incident}
                      </a>
                      <div className="mt-1 font-mono text-[11px] text-faint">
                        block {Number(record.blockNumber).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-5 pr-6 text-sm text-muted">{record.technique}</td>
                    <td className="py-5 pr-6 text-right font-mono text-sm font-bold text-signal">
                      {formatLoss(record.lossUsd)}
                    </td>
                    <td className="py-5 pr-6">
                      <a
                        href={`https://etherscan.io/tx/${record.attackTx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-muted transition-colors hover:text-signal"
                      >
                        {shortTx(record.attackTx)}
                        <ArrowUpRight className="size-3" />
                      </a>
                    </td>
                    <td className="py-5">
                      <Link
                        to="/bounties/$key"
                        params={{ key: record.targetKey }}
                        className={cn(
                          'inline-flex items-center gap-1 font-mono text-xs text-signal',
                          'transition-opacity hover:opacity-80',
                        )}
                      >
                        {record.targetKey}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
