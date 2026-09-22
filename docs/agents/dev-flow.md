# Development Flow

This is the human-facing map for selecting the smallest reliable workflow.
The authoritative working standards and proportional routing rules live in the root `AGENTS.md`.

## Operating principle

Scale process to uncertainty, blast radius, reversibility, and user impact.
Do not create alignment documents, specifications, tickets, or plans merely to satisfy ceremony.
Use them when they reduce ambiguity, preserve a decision, coordinate multiple slices, or make risky work reviewable.

## Workflow levels

| Level | Use when | Required flow |
| --- | --- | --- |
| Read-only | Explanation, diagnosis without a requested fix, review, status, or exploration. | Inspect relevant context, gather evidence, and report without repository or external writes. |
| Focused | Requirements are clear and the change is localized, reversible, and independently verifiable. | Treehouse lease for publishable edits, reproduce if applicable, implement, run focused checks, review the diff, and publish through no-mistakes when requested. |
| Substantive | Behavior, terminology, boundaries, data, or multiple files require alignment or a durable contract. | Align, specify when useful, plan multi-step work, execute, verify, review, and publish through no-mistakes. |
| Initiative | The effort spans many slices and its path is not visible in one session. | Use `wayfinder`, resolve the decision map, create specifications, slice into tickets, then execute each slice through the substantive flow. |

## Skill routing

### Orient

- Use targeted repository search for a known symbol, file, or behavior.
- Read the root and scoped `AGENTS.md` files that govern the target.
- Read `CONTEXT.md` and relevant ADRs before introducing domain language or revisiting decisions.
- Inspect recent history only when it helps explain the current implementation.

### Align and specify

- Use `grill-with-docs` when product language, behavior, boundaries, or costly decisions need one-question-at-a-time alignment under the domain-modeling discipline.
- Use `to-spec` to turn resolved alignment into `docs/prds/<slug>.md` and a linking `ready-for-agent` issue.
- Use `to-tickets` only when a specification needs multiple independently deliverable tracer-bullet slices.
- Skip `to-tickets` for a single coherent slice.
- Use `wayfinder` before alignment for a large initiative whose path is still foggy.
- Use `prototype` only for a disposable experiment that resolves a specific design uncertainty.
- Use `triage` to move incoming issues and external pull requests through the repository's canonical tracker states.

### Plan and build

- Use `writing-plans` for multi-step implementation work.
- Use `executing-plans` when the plan is tightly coupled or does not justify fresh task contexts.
- Use `subagent-driven-development` when plan tasks each justify a fresh implementer and review gate and the active environment permits delegation.
- Treat subagent-driven development as sequential task execution with review between tasks, not parallel editing.
- Use `test-driven-development` for behavior changes and bug fixes.
- Do not mix planners or execute a plan through a different planning system.
- Small focused changes with clear requirements do not require a persisted implementation plan.

### Debug

- Reproduce the failure at the closest meaningful layer before changing code.
- Use E2E reproduction whenever practical for user-visible behavior.
- Use `systematic-debugging` for the full root-cause investigation.
- Add the lowest-cost regression test that protects the corrected behavior.

### Verify and review

- Use focused tests first, then broaden checks according to blast radius.
- Use real-browser E2E verification for user-visible changes whenever practical.
- Use `verification-before-completion` before any claim that work is complete, fixed, or passing.
- Use `requesting-code-review` for implementation review before publication.
- Use `receiving-code-review` when evaluating and applying reviewer feedback.
- Report unrelated findings unless they are trivial, safe, and clearly within scope.

### Publish

- Use `gh-axi` for GitHub operations.
- Use `git push no-mistakes` for the validation, review, and pull-request gate.
- Keep the Treehouse lease until the pull request merges, then return it with `treehouse return <path>`.
- Do not invoke the generic workspace creation in `using-git-worktrees`; the installed dependency yields to Treehouse.
- Do not invoke the generic integration choices in `finishing-a-development-branch`; the installed dependency yields to no-mistakes.

### Upstream compatibility mappings

- References to `setup-matt-pocock-skills` in pinned Matt skills are already satisfied by `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md`.
- References to Matt's `implement` route to `writing-plans` followed by `executing-plans` or `subagent-driven-development`.
- References to Superpowers `brainstorming` route to `grill-with-docs` followed by `to-spec` when a durable contract is needed.
- The relative `using-superpowers` platform-notes link in pinned `executing-plans` is an accepted upstream exception because Codex supplies native agent tools and this repository supplies explicit routing.

## Treehouse

Acquire an isolated worktree before editing a change intended for publication:

```bash
treehouse get --lease --lease-holder <slice-name>
```

The lease satisfies skills that require an isolated workspace.
Never create raw Git worktrees in this repository.

Read-only investigation may remain in the current checkout.

## Domain and tracker artifacts

The root `CONTEXT.md` is the single-context domain glossary.
Read it before introducing marketplace terminology, and update it only when alignment resolves a term.

Use `docs/adr/` only for decisions that are costly to reverse, surprising without context, and the result of a real trade-off.
Use `docs/prds/<slug>.md` as the versioned source of truth for a published product specification.
The linking GitHub issue is the work-queue entry.

See `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md` for details.

## Typical substantive slice

```text
treehouse get --lease --lease-holder listing-search
grill-with-docs
to-spec
writing-plans
executing-plans
test-driven-development
verification-before-completion
requesting-code-review
git push no-mistakes
treehouse return <path> after the PR merges
```

Add `to-tickets` after `to-spec` only when the specification needs multiple slices.
Prepend `wayfinder` only when the initiative is too large and uncertain for direct alignment.
Replace `executing-plans` with `subagent-driven-development` only when the plan's task boundaries justify fresh implementer and reviewer contexts.
