import { expect, mock, test } from 'claude-code/testing'

const FAR = '2999-01-01T00:00:00Z'
const LONG_AGO = '2020-01-01T00:00:00Z'

const BEADS = [
  { id: 'p-epic', title: 'Ship the thing', status: 'in_progress', assignee: 'disp/main', issue_type: 'epic', heartbeat_at: LONG_AGO, lease_expires_at: FAR },
  { id: 'p-live', title: 'Live developer work', status: 'in_progress', assignee: 'dev/live-agent', issue_type: 'task', heartbeat_at: LONG_AGO, lease_expires_at: FAR },
  { id: 'p-dead', title: 'Abandoned work', status: 'in_progress', assignee: 'dev/dead-agent', issue_type: 'task', heartbeat_at: LONG_AGO, lease_expires_at: LONG_AGO },
]

const STEPS = {
  molecule: 'p-epic',
  steps: [
    { id: 'a', status: 'closed', readiness: 'done' },
    { id: 'b', status: 'closed', readiness: 'done' },
    { id: 'c', status: 'in_progress', readiness: 'in_progress' },
    { id: 'd', status: 'open', readiness: 'blocked' },
  ],
}

const WORKTREES = [{ bead_id: 'p-live', classification: 'dirty', dirty: true }]

// A drawn tree splits JSX text into pieces; join them back into what shows.
const textOf = (node: unknown): string => {
  if (typeof node === 'string') return node
  if (typeof node === 'object' && node !== null && 'children' in node) {
    return (node as { children: unknown[] }).children.map(textOf).join('')
  }

  return ''
}

const reply = (stdout: unknown, exitCode = 0) => ({
  value: {
    exitCode,
    stdout: JSON.stringify(stdout),
    stderr: '',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  },
})

test('pane draws agents, liveness and molecule progress from bh output', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-12T12:00:00Z') })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('process.run', async (_$, e) => {
    const argv = e.argv.join(' ')

    if (argv.startsWith('bh work list')) return reply(BEADS)
    if (argv.startsWith('bh work readiness')) return reply(STEPS)
    if (argv.startsWith('bh worktree status')) return reply(WORKTREES)

    return reply([], 1)
  })

  await $.command.run({ command: 'hivewatch', args: '' } as never)

  const ui = await $.ui.mount({
    plugin: 'hivewatch',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'hivewatch',
    props: {
      title: 'Hive',
      isFocused: false,
      bodyColumns: 100,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
    } as never,
  })

  const drawn = textOf(await ui.drawn())

  expect(drawn).toContain('dev/live-agent')
  expect(drawn).toContain('dev/dead-agent')
  expect(drawn).toContain('p-epic')
  expect(drawn).toContain('2/4 (1 running)')
  expect(drawn).toContain('2 live · 1 stale')

  await $.command.run({ command: 'hivewatch', args: 'off' } as never)
})
