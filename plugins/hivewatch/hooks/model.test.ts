import { expect, test } from 'claude-code/testing'

import {
  agentRows,
  ageSec,
  bar,
  fmtAge,
  healthOf,
  moleculeRow,
  parseBeads,
  parseSteps,
  parseWorktrees,
  sanitize,
  summary,
  trunc,
  worktreeOf,
} from './model'

const NOW = Date.parse('2026-10-12T12:00:00Z')

const bead = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  title: 'A bead',
  status: 'in_progress',
  assignee: 'dev/x',
  issue_type: 'task',
  heartbeat_at: '2026-10-12T11:59:00Z',
  lease_expires_at: '2026-10-12T13:00:00Z',
  ...over,
})

test('parses JSON that follows log lines and ignores garbage', () => {
  const out = `2026-10-12 [debug] noise\n${JSON.stringify([bead(), { nope: 1 }])}`
  expect(parseBeads(out).map(b => b.id)).toEqual(['p-1'])
  expect(parseBeads('not json')).toEqual([])
  expect(parseBeads('')).toEqual([])
})

test('parses molecule steps', () => {
  expect(parseSteps(JSON.stringify({ molecule: 'm', steps: [{ id: 'a', status: 'closed', readiness: 'done' }] }))).toHaveLength(1)
  expect(parseSteps('{}')).toEqual([])
})

test('health follows the lease, not the status', () => {
  expect(healthOf(bead(), NOW)).toBe('live')
  expect(healthOf(bead({ lease_expires_at: '2026-10-05T03:28:37Z' }), NOW)).toBe('stale')
  expect(healthOf(bead({ lease_expires_at: null }), NOW)).toBe('unleased')
})

test('agent rows sort live first, then freshest heartbeat, stale last', () => {
  const rows = agentRows(
    [
      bead({ id: 'old', lease_expires_at: '2026-10-05T00:00:00Z', heartbeat_at: '2026-10-04T00:00:00Z' }),
      bead({ id: 'slow', heartbeat_at: '2026-10-12T10:00:00Z' }),
      bead({ id: 'fresh', heartbeat_at: '2026-10-12T11:59:50Z' }),
    ],
    [],
    NOW,
  )
  expect(rows.map(r => r.bead)).toEqual(['fresh', 'slow', 'old'])
})

test('worktree state: none, active, dirty', () => {
  const wts = [
    { bead_id: 'a', classification: 'active', dirty: false },
    { bead_id: 'b', classification: 'dirty', dirty: true },
  ]
  expect(worktreeOf('a', wts)).toBe('active')
  expect(worktreeOf('b', wts)).toBe('dirty')
  expect(worktreeOf('c', wts)).toBe('none')
})

test('molecule progress counts done and running steps', () => {
  const row = moleculeRow(bead({ id: 'm', issue_type: 'epic' }) as never, [
    { id: '1', status: 'closed', readiness: 'done' },
    { id: '2', status: 'closed', readiness: 'done' },
    { id: '3', status: 'in_progress', readiness: 'in_progress' },
    { id: '4', status: 'open', readiness: 'blocked' },
  ])
  expect([row.done, row.total, row.running]).toEqual([2, 4, 1])
})

test('bar fills proportionally and never overflows', () => {
  expect(bar(1, 2, 10)).toBe('█████░░░░░')
  expect(bar(0, 0, 4)).toBe('░░░░')
  expect(bar(9, 3, 4)).toBe('████')
})

test('ages and truncation are compact', () => {
  expect(ageSec('2026-10-12T11:59:00Z', NOW)).toBe(60)
  expect(ageSec(null, NOW)).toBeNull()
  expect(fmtAge(45)).toBe('45s')
  expect(fmtAge(600)).toBe('10m')
  expect(fmtAge(3 * 3600)).toBe('3h')
  expect(fmtAge(8 * 86400)).toBe('8d')
  expect(trunc('abcdef', 4)).toBe('abc…')
})

test('summary counts live and stale agents', () => {
  const rows = agentRows([bead(), bead({ id: 's', lease_expires_at: '2026-10-01T00:00:00Z' })], [], NOW)
  expect(summary(rows)).toBe('1 live · 1 stale')
})

const ESC = '\u001b'

test('sanitize strips CSI, OSC and other escape sequences but keeps the text', () => {
  expect(sanitize(`a${ESC}[2Jb${ESC}[1;31mc`)).toBe('abc')
  expect(sanitize(`${ESC}]0;pwned\u0007title`)).toBe('title')
  expect(sanitize(`${ESC}]0;pwned${ESC}\\title`)).toBe('title')
  expect(sanitize(`x ${ESC}]8;;https://evil.test\u0007click${ESC}]8;;\u0007 y`)).toBe('x click y')
  expect(sanitize(`a${ESC}cb${ESC}(Bc`)).toBe('abc')
})

test('sanitize strips C0, DEL and C1 controls including 8-bit CSI and OSC', () => {
  expect(sanitize('a\rb\u0007c\u0000d\u007fe')).toBe('a bcde')
  expect(sanitize('a\u009b2Jb\u009d0;x\u009cc\u0085d\u009fe')).toBe('abcde')
})

test('sanitize maps tab and newline runs to one space and keeps Unicode', () => {
  expect(sanitize('a\tb\n\nc\r\nd')).toBe('a b c d')
  expect(sanitize('Café 日本語 🚀 naïve')).toBe('Café 日本語 🚀 naïve')
})

test('parsers sanitize every string field', () => {
  const dirty = (s: string) => `${ESC}[2J${s}${ESC}]0;t\u0007`
  const beads = parseBeads(
    JSON.stringify([bead({ id: dirty('p-9'), title: dirty('T\titl\ne'), assignee: dirty('dev/a') })]),
  )
  expect(beads[0]).toMatchObject({ id: 'p-9', title: 'T itl e', assignee: 'dev/a' })
  expect(parseBeads(JSON.stringify([bead({ assignee: null })]))[0]?.assignee).toBeNull()

  const steps = parseSteps(JSON.stringify({ steps: [{ id: dirty('s'), status: dirty('open'), readiness: dirty('done') }] }))
  expect(steps[0]).toEqual({ id: 's', status: 'open', readiness: 'done' })

  const wts = parseWorktrees(JSON.stringify([{ bead_id: dirty('p-9'), classification: dirty('dirty'), dirty: true }]))
  expect(wts[0]).toEqual({ bead_id: 'p-9', classification: 'dirty', dirty: true })
})

test('parsers drop wrong-typed required fields and null wrong-typed optional ones', () => {
  const evil = [`${ESC}[2Jpwned`]
  const obj = { toString: `${ESC}]0;x\u0007` }

  expect(parseBeads(JSON.stringify([bead({ title: evil }), bead({ title: obj }), bead({ status: evil }), bead({ issue_type: obj }), bead({ id: evil })]))).toEqual([])

  const [b] = parseBeads(JSON.stringify([bead({ assignee: evil, heartbeat_at: obj, lease_expires_at: 5, extra: evil })]))
  expect(b).toEqual({
    id: 'p-1',
    title: 'A bead',
    status: 'in_progress',
    assignee: null,
    issue_type: 'task',
    heartbeat_at: null,
    lease_expires_at: null,
  })

  expect(parseSteps(JSON.stringify({ steps: [{ id: 'a', status: evil, readiness: 'done' }, { id: 'b', status: 'open', readiness: obj }] }))).toEqual([])

  expect(
    parseWorktrees(
      JSON.stringify([
        { bead_id: evil, classification: 'clean', dirty: 'yes', extra: evil },
        { bead_id: 'p-1', classification: evil, dirty: true },
      ]),
    ),
  ).toEqual([{ bead_id: null, classification: 'clean', dirty: false }])
})
