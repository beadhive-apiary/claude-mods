# One entry point for local checks, `bh work check`, and CI (.github/workflows/ci.yml).
# Every directory under plugins/ is covered, so a new mod needs no edits here.

set shell := ["bash", "-euo", "pipefail", "-c"]

# TypeScript used for `typecheck`; keep in step with the version the mods were checked against.
typescript := "5.9.3"

_default:
    @just --list

# Install the pinned toolchain from mise.toml / mise.lock.
setup:
    mise install

# What CI runs: validate and test every mod, then scan history for secrets.
check: validate test secret-scan

# `claude plugin validate` on the marketplace, then on every mod.
validate:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "==> validate marketplace"
    claude plugin validate .
    for plugin in $(just _plugins); do
        echo "==> validate $plugin"
        claude plugin validate "$plugin"
    done

# `claude plugin test` on every mod.
test:
    #!/usr/bin/env bash
    set -euo pipefail
    for plugin in $(just _plugins); do
        echo "==> test $plugin"
        claude plugin test "$plugin"
    done

# Redacted full-history secret scan.
secret-scan:
    gitleaks git --redact --no-banner .

# Secret scan of staged changes only, for use before a commit.
secret-scan-staged:
    gitleaks git --staged --redact --no-banner .

# Strict tsc on every mod. Not part of `check` or CI: it needs the engine's
# generated declarations (<plugin>/.claude-plugin/types and <plugin>/tsconfig.json),
# which Claude Code only writes when a session hot-reloads the mod, never headlessly.
typecheck:
    #!/usr/bin/env bash
    set -euo pipefail
    for plugin in $(just _plugins); do
        if [ ! -f "$plugin/tsconfig.json" ] || [ ! -f "$plugin/.claude-plugin/types/tsconfig.json" ]; then
            echo "error: $plugin has no engine-generated types; load it in a Claude Code session first" >&2
            exit 1
        fi
        echo "==> typecheck $plugin"
        npx -y -p typescript@{{typescript}} tsc -p "$plugin" --noEmit
    done

# Mod directories, one per line; fails when there are none so no check passes vacuously.
_plugins:
    #!/usr/bin/env bash
    set -euo pipefail
    found=0
    for dir in plugins/*/; do
        [ -d "$dir" ] || continue
        echo "${dir%/}"
        found=1
    done
    if [ "$found" -eq 0 ]; then
        echo "error: no plugins found under plugins/" >&2
        exit 1
    fi
