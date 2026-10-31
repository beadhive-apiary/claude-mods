# claude-mods

[Claude Code](https://code.claude.com) mods for [Beadhive](https://beadhive.ai): plugins that
change Claude Code's own interface to show what your hives are doing. One repository, one
marketplace (`beadhive-apiary`), one folder per mod under `plugins/`.

| Mod | What it does |
| --- | --- |
| [`hivewatch`](plugins/hivewatch) | Live Beadhive status in a pane: in-flight beads, per-agent liveness, molecule progress. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install hivewatch --marketplace beadhive-apiary/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user is first). Claude Code then shows a
screen for the mod's settings.

From a shell:

```
claude plugin install hivewatch --marketplace beadhive-apiary/claude-mods
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `beadhive-apiary/claude-mods`, then **Add plugin**.

The mods call the [`bh`](https://github.com/beadhive/beadhive) CLI, so `bh` must be on the
`PATH` of the session that loads them.

## hivewatch

Run `/hivewatch` to open the pane (`/hivewatch refresh` to poll now, `/hivewatch off` to stop
polling). The status line also shows `hive: 3 live · 1 stale`.

```
hivewatch · 12 in flight (8 live · 4 stale) · updated 3s ago
dispatched ████████████░░░░░░░░░░░░ 17/21 steps · 2 molecules
  app-oprdu      ████████████░░░░ 12/19 (2 running)  Remote tracklist providers
agents
● dev/provider     app-ttw7n    4h  dirty  Provider: REST search…
○ dev/rank         app-e5yyq    8d  none   Measure similar-set ranking…
```

- **Liveness is the bead's lease**, not the filesystem. `●` means the agent's lease on the
  bead is still valid, `○` means the bead is `in_progress` but the lease has expired (the agent
  stopped heartbeating), `·` means no lease was ever granted.
- **Dispatch progress** comes from `bh work readiness --json` for each in-progress epic (done
  steps over total steps).
- **Worktree state** (`dirty`, `none`) comes from `bh worktree status --json`.

### Settings

| Setting | Default | |
| --- | --- | --- |
| `hives` | empty | Comma-separated hive ids, for example `github/beadhive-apiary/claude-mods`. Empty watches the hive of the session's working directory. |
| `refreshSeconds` | `20` | Poll interval; each poll runs a few `bh` commands per hive, so keep it at 10 or more. |

### Not yet

- Test-run progress bars. Nothing in Beadhive reports test progress per bead today.
- A durable agent identity on each bead. `bd` records an assignee label such as `dev/rank`,
  not the Claude Code session or agent name, so the pane cannot yet join a bead to the live
  agent session.

## Developing

Install [mise](https://mise.jdx.dev), then:

```
just setup          # install the pinned tools, including the Claude Code CLI
just check          # validate + test every mod, then secret-scan (what CI runs)
just validate       # claude plugin validate, marketplace and every mod
just test           # claude plugin test
just typecheck      # strict tsc, see below
claude --plugin-dir plugins/hivewatch      # try a mod in a session
```

CI (`.github/workflows/ci.yml`) runs `just check` on every pull request and on pushes to
`main`. A new directory under `plugins/` is picked up automatically.

`just typecheck` needs the engine's type declarations, which Claude Code writes into
`<plugin>/.claude-plugin/types/` (and a `tsconfig.json` beside the mod) when a session loads
the mod. They are generated per machine and not committed, and no headless command writes
them, so the type-check runs locally after loading the mod once and is not yet part of CI.

Agent and contributor conventions are in [AGENTS.md](AGENTS.md).

## History

hivewatch started in [`SimplicityGuy/claude-mods`](https://github.com/SimplicityGuy/claude-mods)
and moved here at its commit `daa9e7f`.

## License

[MIT](LICENSE).
