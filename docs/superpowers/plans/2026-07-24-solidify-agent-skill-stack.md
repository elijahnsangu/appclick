# Agent Skill Stack Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this plan because the skill manifest and routing documentation are tightly coupled.

**Goal:** Establish one complete, reproducible skill owner for each stage of Marliket's delivery workflow.

**Architecture:** Matt Pocock's promoted skills own alignment, domain modeling, research, specifications, tickets, and initiative wayfinding.
Superpowers v6.2.0 owns planning, execution, TDD, debugging, verification, review discipline, and its internal companion dependencies.
Repository-specific Treehouse and no-mistakes rules override generic Superpowers worktree and branch-finishing behavior.

**Tech Stack:** `skills` CLI, Markdown agent instructions, project-local skill symlinks, and `skills-lock.json`.

## Global Constraints

- Install only promoted Matt skills and released Superpowers skills.
- Keep one selected owner for every workflow verb.
- Install required companion skills even when repository routing replaces their generic entry point.
- Keep all project skills reproducible through `skills-lock.json`.
- Use the skills CLI for manifest changes.
- Preserve every bundled skill resource provided by the pinned release.
- Keep one complete sentence per physical line in Markdown prose.
- Never use the em dash character.

---

### Task 1: Reconcile the skill inventory

**Files:**

- Modify: `.agents/skills/`
- Modify: `.claude/skills/`
- Modify: `skills-lock.json`

- [x] Remove redundant, one-time, and premature feature-specific skills with the skills CLI.
- [x] Install the selected Matt workflow skills from an immutable upstream release.
- [x] Install the complete selected Superpowers dependency group from release `v6.2.0`.
- [x] Confirm all configured agents resolve the same project-local skills.

### Task 2: Make routing explicit

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/agents/dev-flow.md`

- [x] Assign Matt skills to alignment, domain, research, specification, ticketing, and wayfinding.
- [x] Assign Superpowers to implementation planning, execution, TDD, debugging, verification, and review discipline.
- [x] Record Treehouse and no-mistakes as repository overrides.
- [x] Remove references to deleted or competing skills.

### Task 3: Capture and verify the decision

**Files:**

- Create: `docs/research/2026-07-24-agent-skill-stack.md`

- [x] Add the primary-source catalog and dependency audit.
- [x] Check that every routed skill is installed and every internal dependency is present or explicitly overridden.
- [x] Run Markdown, repository, lockfile, and symlink validation.
- [x] Review and commit the complete diff.
- [ ] Republish the branch through no-mistakes.
