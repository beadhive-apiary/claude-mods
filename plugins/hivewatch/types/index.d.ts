export type Health = 'live' | 'stale' | 'unleased'

export type WorktreeState = 'dirty' | 'active' | 'none'

export type AgentRow = {
  agent: string
  bead: string
  title: string
  kind: string
  health: Health
  // Seconds since the bead's last heartbeat; null when it never beat.
  heartbeatAgeSec: number | null
  worktree: WorktreeState
}

export type MoleculeRow = {
  id: string
  title: string
  done: number
  total: number
  running: number
}

export type Snapshot = {
  at: number
  agents: AgentRow[]
  molecules: MoleculeRow[]
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    hivewatch: { snapshot: Snapshot | null }
  }
}
