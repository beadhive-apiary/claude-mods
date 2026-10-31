import type { AgentRow, Health, MoleculeRow, WorktreeState } from '../types'

export type RawBead = {
  id: string
  title: string
  status: string
  assignee: string | null
  issue_type: string
  heartbeat_at?: string | null
  lease_expires_at?: string | null
}

export type RawStep = { id: string; status: string; readiness: string }

export type RawWorktree = { bead_id: string | null; classification: string; dirty: boolean }

// bh can print log lines before its JSON, so parse from the first line that
// opens a value.
export const parseJson = (stdout: string): unknown => {
  const lines = stdout.split('\n')
  const start = lines.findIndex(line => /^[[{]/.test(line))

  if (start < 0) {
    return null
  }

  try {
    return JSON.parse(lines.slice(start).join('\n'))
  } catch {
    return null
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// Text from bh can originate outside the operator (intake imports external
// titles), so it must never reach the terminal with live control sequences.
const ESCAPES = new RegExp(
  [
    '\\u001b\\][^\\u0007\\u001b\\u009c]*(?:\\u0007|\\u001b\\\\|\\u009c)', // OSC, ESC form
    '\\u009d[^\\u0007\\u001b\\u009c]*(?:\\u0007|\\u001b\\\\|\\u009c)', // OSC, 8-bit form
    '\\u001b\\[[0-?]*[ -/]*[@-~]', // CSI, ESC form
    '\\u009b[0-?]*[ -/]*[@-~]', // CSI, 8-bit form
    '\\u001b[ -/]*[0-~]', // other two-byte (and nF) escapes
  ].join('|'),
  'g',
)

export const sanitize = (s: string): string =>
  s
    .replace(ESCAPES, '')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()

// Each parser builds its rows field by field from an explicit shape, so a
// field of the wrong type (an array or object holding escapes) never reaches
// the pane and unexpected keys are dropped. Only a missing id drops a record
// (it cannot be matched to anything); other bad fields get a placeholder so
// real in-flight work stays visible.
const text = (v: unknown): string | null => (typeof v === 'string' ? sanitize(v) : null)

export const parseBeads = (stdout: string): RawBead[] => {
  const v = parseJson(stdout)
  const out: RawBead[] = []

  for (const b of Array.isArray(v) ? v : []) {
    const id = isRecord(b) ? text(b.id) : null

    if (!isRecord(b) || id === null) {
      continue
    }

    out.push({
      id,
      title: text(b.title) ?? '(invalid title)',
      status: text(b.status) ?? '',
      assignee: text(b.assignee),
      issue_type: text(b.issue_type) ?? '',
      heartbeat_at: text(b.heartbeat_at),
      lease_expires_at: text(b.lease_expires_at),
    })
  }

  return out
}

export const parseSteps = (stdout: string): RawStep[] => {
  const v = parseJson(stdout)
  const steps = isRecord(v) ? v.steps : null
  const out: RawStep[] = []

  for (const s of Array.isArray(steps) ? steps : []) {
    const id = isRecord(s) ? text(s.id) : null

    if (!isRecord(s) || id === null) {
      continue
    }

    out.push({ id, status: text(s.status) ?? '', readiness: text(s.readiness) ?? '' })
  }

  return out
}

export const parseWorktrees = (stdout: string): RawWorktree[] => {
  const v = parseJson(stdout)

  return (Array.isArray(v) ? v : []).filter(isRecord).map(w => ({
    bead_id: text(w.bead_id),
    classification: text(w.classification) ?? '',
    dirty: w.dirty === true,
  }))
}

// A lease that has not run out means the agent is holding the bead; an
// expired one means it stopped heartbeating (the bead is still in_progress).
export const healthOf = (bead: RawBead, nowMs: number): Health => {
  const lease = Date.parse(bead.lease_expires_at ?? '')

  if (Number.isNaN(lease)) {
    return 'unleased'
  }

  return lease > nowMs ? 'live' : 'stale'
}

export const ageSec = (iso: string | null | undefined, nowMs: number): number | null => {
  const t = Date.parse(iso ?? '')

  return Number.isNaN(t) ? null : Math.max(0, Math.round((nowMs - t) / 1000))
}

export const worktreeOf = (beadId: string, worktrees: RawWorktree[]): WorktreeState => {
  const wt = worktrees.find(w => w.bead_id === beadId)

  if (!wt) {
    return 'none'
  }

  return wt.dirty ? 'dirty' : 'active'
}

const HEALTH_ORDER: Record<Health, number> = { live: 0, unleased: 1, stale: 2 }

export const agentRows = (
  beads: RawBead[],
  worktrees: RawWorktree[],
  nowMs: number,
): AgentRow[] =>
  beads
    .map(
      (b): AgentRow => ({
        agent: b.assignee ?? '(unassigned)',
        bead: b.id,
        title: b.title,
        kind: b.issue_type,
        health: healthOf(b, nowMs),
        heartbeatAgeSec: ageSec(b.heartbeat_at, nowMs),
        worktree: worktreeOf(b.id, worktrees),
      }),
    )
    .sort(
      (a, b) =>
        HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] ||
        (a.heartbeatAgeSec ?? Infinity) - (b.heartbeatAgeSec ?? Infinity),
    )

export const moleculeRow = (epic: RawBead, steps: RawStep[]): MoleculeRow => ({
  id: epic.id,
  title: epic.title,
  total: steps.length,
  done: steps.filter(s => s.readiness === 'done').length,
  running: steps.filter(s => s.status === 'in_progress').length,
})

export const bar = (done: number, total: number, width: number): string => {
  const w = Math.max(1, width)
  const filled = total > 0 ? Math.min(w, Math.round((done / total) * w)) : 0

  return '█'.repeat(filled) + '░'.repeat(w - filled)
}

export const fmtAge = (sec: number | null): string => {
  if (sec === null) {
    return '-'
  }

  if (sec < 90) {
    return `${sec}s`
  }

  if (sec < 90 * 60) {
    return `${Math.round(sec / 60)}m`
  }

  if (sec < 48 * 3600) {
    return `${Math.round(sec / 3600)}h`
  }

  return `${Math.round(sec / 86400)}d`
}

export const trunc = (s: string, n: number): string =>
  s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`

export const summary = (agents: AgentRow[]): string => {
  const live = agents.filter(a => a.health === 'live').length
  const stale = agents.filter(a => a.health === 'stale').length

  return `${live} live${stale > 0 ? ` · ${stale} stale` : ''}`
}
