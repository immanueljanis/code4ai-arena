import { useCallback, useEffect, useMemo, useState } from 'react'
import { createArenaClient } from './client'
import type {
  AgentRegistration,
  Contest,
  ContestDetail,
  ExploitCall,
  PlaygroundResult,
  Submission,
  SubmitResult,
} from './types'

export interface UseArena {
  contests: Contest[]
  submissions: Submission[]
  selectedKey: string | null
  selected: ContestDetail | null
  loading: boolean
  running: boolean
  error: string | null
  lastVerdict: PlaygroundResult | null
  lastSubmission: SubmitResult | null
  agent: AgentRegistration | null
  select: (key: string) => void
  registerAgent: (label: string) => Promise<AgentRegistration>
  runPlayground: (key: string, exploitCalls: ExploitCall[]) => Promise<PlaygroundResult>
  runSubmit: (key: string, exploitCalls: ExploitCall[]) => Promise<SubmitResult>
  refresh: () => Promise<import('./types').StateResponse>
}

const AGENT_STORAGE_KEY = 'code4ai:agent'

/** Owns all arena data: initial load, selection, registration + exploit actions. */
export function useArena(initialKey?: string | null): UseArena {
  const client = useMemo(() => createArenaClient(), [])
  const [contests, setContests] = useState<Contest[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey ?? null)
  const [selected, setSelected] = useState<ContestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastVerdict, setLastVerdict] = useState<PlaygroundResult | null>(null)
  const [lastSubmission, setLastSubmission] = useState<SubmitResult | null>(null)
  const [agent, setAgent] = useState<AgentRegistration | null>(() => {
    try {
      const raw = localStorage.getItem(AGENT_STORAGE_KEY)
      return raw ? (JSON.parse(raw) as AgentRegistration) : null
    } catch {
      return null
    }
  })

  const rememberAgent = useCallback((reg: AgentRegistration) => {
    setAgent(reg)
    try {
      localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(reg))
    } catch {
      /* storage unavailable — session-only */
    }
  }, [])

  const refresh = useCallback(async () => {
    const state = await client.state()
    setContests(state.targets)
    setSubmissions(state.submissions)
    return state
  }, [client])

  // initial load — prefer the challenge-requested target, else first contest
  useEffect(() => {
    let active = true
    void (async () => {
      const state = await refresh()
      if (!active) return
      const requested = state.targets.find((t) => t.key === initialKey)
      setSelectedKey(requested?.key ?? state.targets[0]?.key ?? null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [client, refresh, initialKey])

  // load the selected contest's detail
  useEffect(() => {
    if (!selectedKey) return
    let active = true
    void client.getContest(selectedKey).then((detail) => {
      if (active) setSelected(detail)
    })
    return () => {
      active = false
    }
  }, [client, selectedKey])

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh().catch(() => undefined)
    }, 5000)
    return () => clearInterval(timer)
  }, [refresh])

  const select = useCallback((key: string) => setSelectedKey(key), [])

  const registerAgent = useCallback(
    async (label: string) => {
      setError(null)
      try {
        const reg = await client.registerAgent(label)
        rememberAgent(reg)
        return reg
      } catch (e) {
        setError((e as Error).message || 'agent registration failed')
        throw e
      }
    },
    [client, rememberAgent],
  )

  const runPlayground = useCallback(
    async (key: string, exploitCalls: ExploitCall[]) => {
      setError(null)
      setRunning(true)
      setLastVerdict(null)
      try {
        const result = await client.playground(key, exploitCalls)
        setLastVerdict(result)
        return result
      } catch (e) {
        setError((e as Error).message || 'playground run failed')
        throw e
      } finally {
        setRunning(false)
      }
    },
    [client],
  )

  const runSubmit = useCallback(
    async (key: string, exploitCalls: ExploitCall[]) => {
      if (!agent) throw new Error('register an agent first (Playground tab → Submit tab)')
      setError(null)
      setRunning(true)
      setLastSubmission(null)
      try {
        // Onchain calls must be signed by the agent's wallet: rewrite every
        // caller to the registered agent address (verifier-only calls, e.g.
        // time-window's beneficiary, still work when set manually).
        const agentCalls = exploitCalls.map((c) => ({ ...c, caller: agent.walletAddress }))
        const result = await client.submit(key, agent.id, agentCalls)
        setLastSubmission(result)
        await refresh()
        return result
      } catch (e) {
        setError((e as Error).message || 'submission failed')
        throw e
      } finally {
        setRunning(false)
      }
    },
    [client, agent, refresh],
  )

  return {
    contests,
    submissions,
    selectedKey,
    selected,
    loading,
    running,
    error,
    lastVerdict,
    lastSubmission,
    agent,
    select,
    registerAgent,
    runPlayground,
    runSubmit,
    refresh,
  }
}
