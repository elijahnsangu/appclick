# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `elijahnsangu/marliket`.
Use `gh-axi` (the agent-ergonomic wrapper) for all operations; fall back to raw `gh` only for operations `gh-axi` does not cover.

## Conventions

- **Create an issue**: `gh-axi issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh-axi issue view <number>` (includes comments and labels).
- **List issues**: `gh-axi issue list --state open` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh-axi issue comment <number> --body "..."`
- **Apply / remove labels**: `gh-axi issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh-axi issue close <number> --comment "..."`

Infer the repo from `git remote -v` - the CLI does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** External PRs are not pulled into the triage queue.

## When a skill says "publish a PRD"

Two artifacts, always both:

1. **Commit the PRD** as `docs/prds/<slug>.md` in the repo (reviewable, versioned).
2. **Create a GitHub issue** titled `PRD: <title>` whose body links the doc (blob URL on the branch it lives on) and carries a short summary. Apply the `ready-for-agent` label.

The issue is the work-queue entry; the doc is the source of truth. `to-tickets` slices child issues from the doc and links them to the PRD issue.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `gh-axi issue create`.

## When a skill says "fetch the relevant ticket"

Run `gh-axi issue view <number>`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh-axi issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`), plus `wayfinder:claimed` once claimed.
- **Blocking**: native issue relationships where available; otherwise a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every issue it lists is closed.
- **Frontier query**: list the map's open children (`gh-axi issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open `Blocked by` issue or the `wayfinder:claimed` label; first in map order wins.
- **Claim**: `gh-axi issue edit <n> --add-label wayfinder:claimed` - the session's first write.
- **Resolve**: `gh-axi issue comment <n> --body "<answer>"`, then `gh-axi issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
