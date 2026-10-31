import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'
import {
  agentRows,
  bar,
  fmtAge,
  moleculeRow,
  parseBeads,
  parseSteps,
  parseWorktrees,
  summary,
  trunc,
} from './model'
import type { RawBead, RawWorktree } from './model'
import type { MoleculeRow } from '../types'

const PANE = 'hivewatch'
const MAX_MOLECULES = 6

const snapshot = atom({ plugin: 'hivewatch', key: 'snapshot' } as const, null)

type BhResult = { stdout: string; error: string | null }

const bh = async ($: EngineInterface, args: string[]): Promise<BhResult> => {
  try {
    const ran = await $.process.run(['bh', ...args], { timeoutMs: 60_000 })

    return ran.exitCode === 0
      ? { stdout: ran.stdout, error: null }
      : { stdout: '', error: `bh ${args.slice(0, 2).join(' ')} exited ${ran.exitCode}` }
  } catch (err) {
    return { stdout: '', error: `bh ${args.slice(0, 2).join(' ')}: ${String(err)}` }
  }
}

const collect = async ($: EngineInterface, hives: string[]): Promise<Snapshot> => {
  const now = await $.clock.now()
  const beads: RawBead[] = []
  const worktrees: RawWorktree[] = []
  const molecules: MoleculeRow[] = []
  const errors: string[] = []

  for (const hive of hives.length > 0 ? hives : [null]) {
    const scope = hive === null ? [] : ['--hive', hive]
    const list = await bh($, ['work', 'list', ...scope, '--status', 'in_progress', '--json'])

    if (list.error !== null) {
      errors.push(list.error)
      continue
    }

    const inflight = parseBeads(list.stdout)
    beads.push(...inflight)

    const wt = await bh($, ['worktree', 'status', ...scope, '--json'])

    if (wt.error === null) {
      worktrees.push(...parseWorktrees(wt.stdout))
    }

    for (const epic of inflight.filter(b => b.issue_type === 'epic').slice(0, MAX_MOLECULES)) {
      const steps = await bh($, ['work', 'readiness', epic.id, ...scope, '--json'])

      if (steps.error === null) {
        molecules.push(moleculeRow(epic, parseSteps(steps.stdout)))
      } else {
        errors.push(steps.error)
      }
    }
  }

  return { at: now, agents: agentRows(beads, worktrees, now), molecules, error: errors.join('; ') || null }
}

const HEALTH_MARK = { live: '●', stale: '○', unleased: '·' } as const
const HEALTH_COLOR = { live: 'green', stale: 'red', unleased: 'yellow' } as const

type Config = { hives: string[]; refreshMs: number }

// Timers die with the module on a reload, so these may live outside $.state.
let timer: { cancel: () => void } | null = null
let isBusy = false

const refresh = async ($: EngineInterface, config: Config): Promise<void> => {
  if (isBusy) {
    return
  }

  isBusy = true

  try {
    const snap = await collect($, config.hives)
    await update($, snapshot, () => snap)
    $.ui.status(
      snap.error !== null && snap.agents.length === 0
        ? 'hivewatch: bh unavailable'
        : `hive: ${summary(snap.agents)}`,
    )
  } finally {
    isBusy = false
  }
}

const start = ($: EngineInterface, config: Config): void => {
  if (timer === null) {
    timer = $.clock.every(config.refreshMs, () => void refresh($, config))
  }

  void refresh($, config)
}

const stop = ($: EngineInterface): void => {
  timer?.cancel()
  timer = null
  $.ui.status(undefined)
}

export const register: Register = (on, options) => {
  const opts = options as Record<string, unknown>
  const config: Config = {
    hives: String(opts.hives ?? '')
      .split(',')
      .map(h => h.trim())
      .filter(h => h !== ''),
    refreshMs: Math.max(10, Number(opts.refreshSeconds ?? 20)) * 1000,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hivewatch',
      description: 'Live Beadhive status: in-flight beads, agent liveness, molecule progress (off | refresh)',
    })

    return next(e)
  })

  on('command.run', { command: 'hivewatch' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === 'off') {
      stop($)

      return { text: 'hivewatch polling stopped.' }
    }

    start($, config)
    await $.ui.open({ id: PANE, title: 'Hive' })

    return { text: arg === 'refresh' ? 'hivewatch refreshed.' : 'hivewatch pane opened.' }
  })

  on('session.end', async ($, e, next) => {
    stop($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 80

    if (snap === null) {
      return <Text dimColor>Polling bh…</Text>
    }

    const now = await $.clock.now()
    const barWidth = Math.max(8, Math.min(24, Math.floor(columns / 4)))
    const done = snap.molecules.reduce((n, m) => n + m.done, 0)
    const total = snap.molecules.reduce((n, m) => n + m.total, 0)
    const titleRoom = Math.max(10, columns - 24 - 14 - 6 - 7 - 4)

    return (
      <Box flexDirection="column">
        <Text bold>
          hivewatch · {snap.agents.length} in flight ({summary(snap.agents)}) ·{' '}
          <Text dimColor>updated {fmtAge(Math.round((now - snap.at) / 1000))} ago</Text>
        </Text>

        {snap.error !== null && <Text color="red">{trunc(snap.error, columns)}</Text>}

        <Text>
          dispatched {bar(done, total, barWidth)} {done}/{total} steps ·{' '}
          {snap.molecules.length} {snap.molecules.length === 1 ? 'molecule' : 'molecules'}
        </Text>

        {snap.molecules.map(m => (
          <Text>
            {'  '}
            {trunc(m.id, 14).padEnd(14)} {bar(m.done, m.total, barWidth)} {m.done}/{m.total}
            {m.running > 0 ? ` (${m.running} running)` : ''}{' '}
            <Text dimColor>{trunc(m.title, Math.max(8, columns - barWidth - 40))}</Text>
          </Text>
        ))}

        <Text> </Text>
        <Text bold>agents</Text>
        {snap.agents.length === 0 && <Text dimColor>  nothing in flight.</Text>}

        {snap.agents.map(a => (
          <Text>
            <Text color={HEALTH_COLOR[a.health]}>{HEALTH_MARK[a.health]}</Text>{' '}
            {trunc(a.agent, 24).padEnd(24)} {trunc(a.bead, 14).padEnd(14)}{' '}
            {fmtAge(a.heartbeatAgeSec).padStart(4)} {a.worktree.padEnd(6)}{' '}
            <Text dimColor>{trunc(a.title, titleRoom)}</Text>
          </Text>
        ))}

        <Text dimColor>● live lease  ○ stale (lease expired)  · no lease</Text>
      </Box>
    )
  })
}
