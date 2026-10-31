# AGENTS.md

Guidance for AI coding agents working in `beadhive-apiary/claude-mods`.

## Project overview

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins) of mods for
[Beadhive](https://beadhive.ai): plugins that change Claude Code's own interface. The
marketplace file is `.claude-plugin/marketplace.json` (marketplace name `beadhive-apiary`);
each mod lives in its own folder under `plugins/<mod>/` with its own
`.claude-plugin/plugin.json`, `hooks/hooks.json` and hooks module.

This repository is declared in [`beadhive-apiary/infra`](https://github.com/beadhive-apiary/infra),
which owns its settings, visibility, access and labels. Change those there, not through the
GitHub UI. It is public: anything committed here is readable by anyone and installable as a mod.

## Work tracking

All implementation work is assigned and performed through Beadhive. Use `bh work brief`,
`bh work claim` (or `resume`), and `bh work check`; submit with `bh work submit`. Do not
create branches or open pull requests outside that lifecycle.

Never add a model to a bead or molecule spec unless the operator names one for that bead. Use
the `complexity:SIMPLE|MEDIUM|COMPLEX|REASONING` label for routing.

## Commands

`just` lists every recipe. The ones that matter:

- `just setup`: install the mise-pinned tools (`mise.toml`, `mise.lock`), including the
  Claude Code CLI that `validate` and `test` run.
- `just check`: what CI and `bh work check` run. `claude plugin validate` on the marketplace
  and every mod, `claude plugin test` on every mod, and a redacted full-history gitleaks scan.
- `just typecheck`: strict `tsc` per mod. Local only; it needs the engine-generated types a
  session writes when it loads the mod (see README, Developing).

## Adding or changing a mod

- One folder per mod under `plugins/`, named after the mod's `plugin.json` `name`, and one
  entry for it in `.claude-plugin/marketplace.json`. The `just` recipes pick up new folders
  by themselves.
- Every value a mod keeps in `$.state` is declared in its `types/index.d.ts` contract.
- Every mod ships `*.test.ts` coverage that `claude plugin test` runs, faking `bh` and other
  processes rather than calling them.
- Bump the mod's `version` in `plugin.json` for any change users should receive, and add the
  mod and its install line to `README.md`.
- Mods read Beadhive state through `bh` commands only. They never write beads.

## Conventions

- Conventional Commits for every commit message, scoped to the mod where it applies
  (`feat(hivewatch): ...`).
- Tool versions live in `mise.toml`, locked in `mise.lock`; do not install tools outside mise.
- GitHub Actions: only `actions/*` (GitHub-owned), pinned to a full commit SHA with the
  version in a trailing comment, `permissions: contents: read`, and stable job names. The
  organization Actions policy refuses anything else.
- Never commit secrets, tokens, machine-local paths, or the engine-generated
  `plugins/*/tsconfig.json` and `plugins/*/.claude-plugin/types/`.
- `.beads/` and agent tool directories (`.claude/`, `.codex/`, `.cursor/`, `.agents/`) are
  local-only and ignored; never commit them.
- Pushes, visibility changes and releases need explicit operator approval.
