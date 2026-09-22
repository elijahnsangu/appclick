# Agent Instructions Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `AGENTS.md` the concise canonical instruction file and move detailed guidance into focused documents without losing repository-specific safeguards.

**Architecture:** The root instruction file will act as a durable router containing repository context, non-negotiable rules, essential commands, critical invariants, proportional workflow selection, and the definition of done.
Detailed repository architecture and workflow mechanics will live under `docs/agents/`, while `CLAUDE.md` and `GEMINI.md` remain compatibility symlinks to the canonical file.

**Tech Stack:** Markdown, Git symlinks, pnpm, Ultracite.

## Global Constraints

- Never use the em dash character.
- Keep one complete sentence per physical line in long Markdown prose.
- Preserve all repository-specific safety, architecture, verification, and release requirements.
- Make workflows proportional to task risk and scope.
- Keep `AGENTS.md` below the default Codex project instruction limit and make every always-loaded rule actionable.

---

### Task 1: Canonical instruction surface

**Files:**

- Create: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `GEMINI.md`
- Modify: `README.md`
- Create: `apps/server/AGENTS.md`
- Create: `docs/agents/repository-guide.md`
- Modify: `docs/agents/dev-flow.md`

**Interfaces:**

- Consumes: Current repository conventions in `CLAUDE.md`, official Codex guidance for concise layered `AGENTS.md` files, and the user's alignment decisions.
- Produces: One canonical root instruction file, two compatibility symlinks, scoped Hono and Cloudflare Worker instructions, a detailed repository reference, and a proportional development workflow reference.

- [x] **Step 1: Capture the baseline**

Run: `wc -c -l CLAUDE.md && readlink AGENTS.md && readlink GEMINI.md`

Expected: `CLAUDE.md` is the current 11.9 KB canonical file and both compatibility names point to it.

- [x] **Step 2: Replace the canonical file and compatibility links**

Write `AGENTS.md` with only durable repository context, rules, commands, critical invariants, proportional workflow routing, tool choices, and completion criteria.
Replace `CLAUDE.md` and `GEMINI.md` with symlinks to `AGENTS.md`.
Update the README onboarding pointer to name the canonical file.

- [x] **Step 3: Add scoped server instructions**

Create `apps/server/AGENTS.md` with the Hono route structure, typed RPC registration rule, disposable application-module graph, fixed invocation clock, Worker binding boundaries, strict test graph, and focused server commands.
Link to it from the root file so sessions launched at the repository root load it before changing server code.

- [x] **Step 4: Move detailed repository guidance**

Create `docs/agents/repository-guide.md` with the app and package inventory, environment layout, database rules, API and application-module patterns, authentication boundaries, design-system constraints, TypeScript configuration, and testing details.

- [x] **Step 5: Make the development workflow proportional**

Update `docs/agents/dev-flow.md` so small and read-only work avoids unnecessary specifications and plans, user-visible defects are reproduced E2E when practical, and substantial or foggy work still follows the appropriate alignment, specification, planning, verification, review, and publication lanes.

- [x] **Step 6: Verify instruction discovery and references**

Run: `test -f AGENTS.md && test -f apps/server/AGENTS.md && test "$(readlink CLAUDE.md)" = AGENTS.md && test "$(readlink GEMINI.md)" = AGENTS.md`

Expected: All checks exit successfully.

Run: `rg -n "CLAUDE.md wins|edit CLAUDE.md|Full chain \(all changes\)|If something looks off, even if unrelated|first reproduce the bug E2E" AGENTS.md docs/agents CLAUDE.md GEMINI.md`

Expected: No matches.

- [x] **Step 7: Run repository documentation checks**

Run: `pnpm check`

Expected: Ultracite reports no errors.

Run: `git diff --check`

Expected: No whitespace errors.

- [x] **Step 8: Review the final diff**

Run: `git diff --stat && git diff -- AGENTS.md CLAUDE.md GEMINI.md apps/server/AGENTS.md docs/agents/repository-guide.md docs/agents/dev-flow.md`

Expected: The root instruction file is materially shorter, the moved guidance remains discoverable, and no repository-specific safeguards are lost.
