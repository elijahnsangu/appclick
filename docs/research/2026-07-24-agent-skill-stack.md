# Agent skill stack audit

Date: 2026-07-24.

This report audits the promoted and experimental skills in `mattpocock/skills`, the official `obra/superpowers` catalog, and the skills currently present in or referenced by Marliket.

All upstream claims use first-party repository sources.

## Executive recommendation

Marliket should use Matt Pocock's skills for product alignment, domain discovery, research, specification, and initiative wayfinding.

Marliket should use Superpowers for implementation planning, test-driven execution, debugging, verification, and review discipline.

The repository should keep one owner for each verb and should not install two interchangeable debugging, TDD, code-review, specification, or implementation lanes.

Before this change, the Superpowers installation was incomplete because `writing-plans`, `executing-plans`, and `subagent-driven-development` referenced companion skills and files that were not installed.

Before this change, the Matt Pocock copies had no recorded upstream release.

The recommended import pins are Matt Pocock `v1.1.0` and Superpowers `v6.2.0`.

The recommended runtime stack is:

- Keep `grill-with-docs`, `grilling`, `domain-modeling`, `research`, `triage`, `to-spec`, `to-tickets`, and `wayfinder` from Matt Pocock `v1.1.0`.
- Add `prototype` from Matt Pocock `v1.1.0` because `wayfinder` names prototypes as a decision-resolution mechanism.
- Keep `writing-plans`, `executing-plans`, and `subagent-driven-development` from Superpowers `v6.2.0` after updating them together.
- Add `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `receiving-code-review`, `using-git-worktrees`, and `finishing-a-development-branch` from Superpowers `v6.2.0`.
- Add `dispatching-parallel-agents` only if Marliket explicitly permits parallel subagents for independent investigations.
- Keep `better-auth-best-practices` as a project-specific reference while Better Auth remains part of the platform.
- Remove the redundant or premature local skills listed in the removal section.

The safest source policy is to pin each imported catalog to one immutable tag or commit, record that source in a manifest, and update the complete dependency group in one reviewed change.

## Source state and maturity

### Matt Pocock catalog

The upstream repository contains 41 skill directories: 22 promoted, nine in progress, four deprecated, four miscellaneous, and two personal.

The upstream README calls the promoted set skills used daily for real engineering and divides them into model-invoked disciplines and user-invoked orchestrators.

The repository currently exposes 22 promoted skills across engineering and productivity in its [main README at commit `ed37663`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/README.md).

The repository also exposes nine experimental skills under `skills/in-progress`, whose own README says they are not ready to ship and may contain breaking changes or abandoned experiments.

That maturity boundary is explicit in the [in-progress catalog](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/in-progress/README.md).

The latest published release is [`v1.1.0`](https://github.com/mattpocock/skills/releases/tag/v1.1.0), while the main-branch Claude plugin manifest reports `1.2.0`, so production imports should use a release tag or reviewed commit rather than an unqualified `main`.

The catalog is promoted but fast-moving rather than release-stable because `to-tickets` changed on 2026-07-21 and several alignment skills changed in the preceding week.

The upstream project added Codex `agents/openai.yaml` metadata to every skill in [commit `697d4ce`](https://github.com/mattpocock/skills/commit/697d4ce9742da558fd1ba6697c8e9775e2e302dd), including explicit implicit-invocation policy for user-invoked skills.

The repository has a clear promotion taxonomy and release automation, but its [package scripts](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/package.json) do not expose a catalog-wide behavioral test or lint command.

This means maturity is strongest for the promoted workflow and weaker than Superpowers in automated skill-behavior validation.

### Superpowers catalog

The official repository describes Superpowers as a complete software-development methodology built from composable skills in its [README](https://github.com/obra/superpowers/blob/v6.2.0/README.md).

Release `v6.2.0` was cut on 2026-07-23 and contains 14 skills in the [official skill directory](https://github.com/obra/superpowers/tree/v6.2.0/skills).

The release notes document live evaluation campaigns, deterministic tests, cross-harness packaging, and a substantial rewrite of subagent-driven development.

Those signals make the catalog mature overall, while `subagent-driven-development` remains an actively evolving orchestration skill.

The current maturity and changes are documented in the [v6.2.0 release notes](https://github.com/obra/superpowers/blob/v6.2.0/RELEASE-NOTES.md).

## Matt Pocock promoted catalog audit

### Alignment and routing

- [`ask-matt`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/ask-matt/SKILL.md) routes a user to another user-invoked skill, overlaps Marliket's explicit `AGENTS.md` routing, depends on the routed skills being present, and is promoted but unnecessary when the repository already owns the route map.
- [`grill-with-docs`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/grill-with-docs/SKILL.md) performs alignment while maintaining domain documents, overlaps Superpowers `brainstorming`, depends on `grilling` and `domain-modeling`, and is a promoted flagship skill that fits Marliket's empty domain model.
- [`grilling`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/grilling/SKILL.md) supplies the reusable one-question-at-a-time interview discipline, overlaps the questioning portion of Superpowers `brainstorming`, has no implementation dependency, and is promoted.
- [`grill-me`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/grill-me/SKILL.md) wraps `grilling` for general non-code use, overlaps `grill-with-docs` inside this engineering repository, depends on `grilling`, and is promoted but not essential to Marliket's code workflow.

### Domain, research, and design

- [`domain-modeling`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/domain-modeling/SKILL.md) sharpens ubiquitous language and records durable decisions, overlaps no Superpowers core skill, depends on the repository's `CONTEXT.md` and ADR conventions, and is promoted and highly relevant to Marliket's domain-driven architecture.
- [`research`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/research/SKILL.md) delegates primary-source research and writes a cited repository note, overlaps broad research tools but not an upstream Superpowers skill, depends on subagent support, and is promoted.
- [`prototype`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/prototype/SKILL.md) builds deliberately disposable experiments to answer design questions, overlaps exploratory spikes inside wayfinding, depends on a concrete uncertainty and a throwaway boundary, and is promoted.
- [`codebase-design`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/codebase-design/SKILL.md) provides deep-module vocabulary and design discipline, overlaps architecture guidance in Superpowers `brainstorming` and `writing-plans`, is a dependency of `improve-codebase-architecture`, and is promoted.
- [`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/improve-codebase-architecture/SKILL.md) scans active code for deepening opportunities and then aligns on a selected change, overlaps architecture review and visual planning, depends on `codebase-design`, `grilling`, and `domain-modeling`, and is promoted but is more useful after Marliket has a substantive marketplace codebase.

### Tracker, specification, and execution

- [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/setup-matt-pocock-skills/SKILL.md) configures tracker, label, and domain-document conventions, overlaps repository bootstrap work, has no ongoing runtime dependency, and is promoted but designed to run once.
- [`triage`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/triage/SKILL.md) moves incoming work through configured tracker states, overlaps GitHub issue-triage automation, depends on the setup-generated tracker and label documentation, and is promoted but optional until Marliket has an active inbound queue.
- [`to-spec`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/to-spec/SKILL.md) synthesizes an already aligned conversation into a tracker-backed specification, overlaps the document output of Superpowers `brainstorming`, depends on prior alignment and tracker configuration, and is promoted.
- [`to-tickets`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/to-tickets/SKILL.md) slices a multi-slice specification into tracer-bullet tickets with blocking edges, overlaps the task decomposition in Superpowers `writing-plans` at a larger granularity, depends on a source specification and tracker configuration, and is promoted but was edited as recently as 2026-07-21.
- [`wayfinder`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/wayfinder/SKILL.md) maps a multi-session initiative into decision tickets and resolves its frontier, overlaps large-scale discovery and program planning, depends on tracker configuration plus `grilling`, `domain-modeling`, `research`, and prototype or task resolvers, and is promoted but recently evolved.
- [`implement`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/implement/SKILL.md) executes tickets or a specification through TDD and code review, directly overlaps Marliket's Superpowers build lane, depends on Matt's `tdd` and `code-review`, and is promoted but should not coexist as a second implementation orchestrator.

### Quality and maintenance

- [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/diagnosing-bugs/SKILL.md) creates a tight reproduction signal before minimizing, hypothesizing, instrumenting, fixing, and regression-testing, directly overlaps Superpowers `systematic-debugging`, depends on an agent-runnable reproduction and can hand architecture problems to `improve-codebase-architecture`, and is promoted.
- [`tdd`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/tdd/SKILL.md) drives red-green-refactor in vertical slices, directly overlaps Superpowers `test-driven-development`, depends on a meaningful test seam, and is promoted.
- [`code-review`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/code-review/SKILL.md) reviews standards and specification compliance with separate subagents, overlaps Superpowers review skills and `no-mistakes`, depends on a fixed comparison point and originating requirements, and is promoted.
- [`resolving-merge-conflicts`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/engineering/resolving-merge-conflicts/SKILL.md) resolves merge or rebase conflicts by tracing each side's intent, overlaps ordinary Git conflict handling rather than another workflow skill, depends on primary evidence from both sides, and is promoted but episodic.

### General productivity

- [`handoff`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/handoff/SKILL.md) writes a compact continuation document, overlaps native conversation compaction and durable plan ledgers, has no hard dependency, and is promoted but optional.
- [`teach`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/teach/SKILL.md) maintains a stateful multi-session curriculum, does not overlap Marliket's delivery workflow, depends on a teaching workspace, and is promoted but out of scope.
- [`writing-great-skills`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/writing-great-skills/SKILL.md) is reference material for authoring predictable skills, overlaps Superpowers `writing-skills`, depends on an active skill-authoring task, and is promoted but should be installed only for workflow maintenance.

## Matt Pocock experimental catalog audit

Upstream explicitly excludes every skill in this section from its plugin and promoted README.

- `loop-me` maintains a multi-session self-grilling workspace and overlaps wayfinding and plan authoring.
- `wizard` generates interactive shell guidance for human procedures and does not serve Marliket's normal agent delivery lane.
- `writing-beats`, `writing-fragments`, and `writing-shape` form an experimental editorial-writing workflow and are unrelated to Marliket engineering.
- `claude-handoff` starts a Claude-specific background continuation and overlaps native Codex subagents and the promoted `handoff`.
- `setup-ts-deep-modules` configures dependency-cruiser around deep-module constraints and could become relevant later, but its experimental status makes a local architecture rule or reviewed dependency policy safer today.
- `to-questionnaire` prepares asynchronous discovery questionnaires and is not needed for the current direct alignment flow.
- `batch-grill-me` asks a decision frontier in rounds and overlaps the promoted one-question `grilling` discipline.

No experimental skill should be installed into the default Marliket workflow.

## Other Matt Pocock source buckets

The source tree also contains deprecated, miscellaneous, and personal skills that are not part of the promoted catalog.

### Deprecated

- [`design-an-interface`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/deprecated/design-an-interface/SKILL.md) explores parallel interface alternatives, overlaps `codebase-design`, and has been superseded by that promoted discipline.
- [`qa`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/deprecated/qa/SKILL.md) turns conversational bug intake into issues, overlaps `triage`, `diagnosing-bugs`, and `to-tickets`, and is explicitly deprecated.
- [`request-refactor-plan`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/deprecated/request-refactor-plan/SKILL.md) interviews for a refactor issue, overlaps the current grilling, specification, and ticket flow, and is explicitly deprecated.
- [`ubiquitous-language`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/deprecated/ubiquitous-language/SKILL.md) writes a separate ubiquitous-language document, overlaps `domain-modeling`, and has been superseded by `CONTEXT.md` plus ADRs.

### Miscellaneous

- [`git-guardrails-claude-code`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/misc/git-guardrails-claude-code/SKILL.md) installs Claude-specific Git hooks, overlaps Marliket's existing tool permissions and versioned hooks, and is rarely used upstream.
- [`migrate-to-shoehorn`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/misc/migrate-to-shoehorn/SKILL.md) performs a library-specific TypeScript test migration, has no Marliket dependency, and is rarely used upstream.
- [`scaffold-exercises`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/misc/scaffold-exercises/SKILL.md) scaffolds course exercises around a private workflow, has no Marliket use, and is rarely used upstream.
- [`setup-pre-commit`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/misc/setup-pre-commit/SKILL.md) installs Husky, lint-staged, and Prettier, overlaps Marliket's `.githooks`, Ultracite, and `no-mistakes` pipeline, and should not be installed.

### Personal

- [`edit-article`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/personal/edit-article/SKILL.md) edits articles in Matt Pocock's writing workflow, overlaps the experimental writing skills, and is unrelated to Marliket.
- [`obsidian-vault`](https://github.com/mattpocock/skills/blob/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/personal/obsidian-vault/SKILL.md) manages a hard-coded personal vault, depends on Matt Pocock's machine layout, and must not be imported.

## Superpowers catalog audit

- [`brainstorming`](https://github.com/obra/superpowers/blob/v6.2.0/skills/brainstorming/SKILL.md) turns an idea into an approved design and committed specification, overlaps `grill-with-docs` plus `to-spec`, depends on `writing-plans` as its terminal transition, and is mature but should not be added because Marliket already chose the Matt alignment lane.
- [`dispatching-parallel-agents`](https://github.com/obra/superpowers/blob/v6.2.0/skills/dispatching-parallel-agents/SKILL.md) delegates independent problem domains concurrently, overlaps generic subagent orchestration, depends on genuinely independent state, and is mature but should be restricted to investigations because shared implementation edits create conflicts.
- [`executing-plans`](https://github.com/obra/superpowers/blob/v6.2.0/skills/executing-plans/SKILL.md) executes a written plan directly with checkpoints, overlaps `subagent-driven-development`, depends on `using-git-worktrees` and `finishing-a-development-branch`, and is a mature fallback for tightly coupled work or environments without subagents.
- [`finishing-a-development-branch`](https://github.com/obra/superpowers/blob/v6.2.0/skills/finishing-a-development-branch/SKILL.md) verifies and offers integration choices, overlaps Marliket's mandatory `git push no-mistakes` and Treehouse lifecycle, depends on fresh test evidence, and is mature but must be overridden by repository-specific shipping rules.
- [`receiving-code-review`](https://github.com/obra/superpowers/blob/v6.2.0/skills/receiving-code-review/SKILL.md) evaluates review feedback before applying it, overlaps GitHub comment-addressing workflows, depends on codebase verification, and is mature.
- [`requesting-code-review`](https://github.com/obra/superpowers/blob/v6.2.0/skills/requesting-code-review/SKILL.md) supplies a focused reviewer-subagent process and template, overlaps Matt's `code-review` and `no-mistakes`, is a direct dependency of `subagent-driven-development`, and is mature.
- [`subagent-driven-development`](https://github.com/obra/superpowers/blob/v6.2.0/skills/subagent-driven-development/SKILL.md) executes plan tasks through fresh implementers, task review loops, a ledger, and a final review, overlaps `executing-plans`, depends on `using-git-worktrees`, `requesting-code-review`, `finishing-a-development-branch`, prompt templates, and helper scripts, and is production-evaluated but actively evolving.
- [`systematic-debugging`](https://github.com/obra/superpowers/blob/v6.2.0/skills/systematic-debugging/SKILL.md) investigates root cause before proposing fixes, overlaps Matt's `diagnosing-bugs`, depends on a reproducible signal and hands the eventual fix into TDD, and is mature with tested helper scripts.
- [`test-driven-development`](https://github.com/obra/superpowers/blob/v6.2.0/skills/test-driven-development/SKILL.md) enforces red-green-refactor and meaningful tests, overlaps Matt's `tdd`, depends on its `writing-good-tests.md` reference, and is mature and central to Marliket's engineering standard.
- [`using-git-worktrees`](https://github.com/obra/superpowers/blob/v6.2.0/skills/using-git-worktrees/SKILL.md) ensures isolated work before implementation, overlaps Treehouse, depends on native isolation or a safe Git fallback, and is mature but must treat a Treehouse lease as the existing native workspace.
- [`using-superpowers`](https://github.com/obra/superpowers/blob/v6.2.0/skills/using-superpowers/SKILL.md) bootstraps aggressive skill discovery, overlaps Codex's native skill discovery and Marliket's explicit routing, has no task-level dependency, and is mature but unnecessary as a project-vendored skill.
- [`verification-before-completion`](https://github.com/obra/superpowers/blob/v6.2.0/skills/verification-before-completion/SKILL.md) prohibits completion claims without fresh evidence, overlaps built-in verification and `no-mistakes` but governs claims rather than test scope, has no companion dependency, and is mature and essential.
- [`writing-plans`](https://github.com/obra/superpowers/blob/v6.2.0/skills/writing-plans/SKILL.md) turns an approved specification into implementation tasks with interfaces and global constraints, overlaps `to-tickets` only at a finer execution granularity, feeds `executing-plans` or `subagent-driven-development`, and is mature.
- [`writing-skills`](https://github.com/obra/superpowers/blob/v6.2.0/skills/writing-skills/SKILL.md) applies TDD-like discipline to skill authoring, overlaps Matt's `writing-great-skills`, depends on `test-driven-development`, and is mature but only needed while authoring skills.

## Marliket baseline before reconciliation

### Provenance and versioning

The repository vendors 18 skill directories under `.agents/skills`, while three Superpowers skills are available from `/home/nsangu/.agents/skills` rather than from the worktree.

No repository manifest records the upstream repository, tag, commit, import date, file hashes, or local patch set for either catalog.

The project copies therefore are vendored but not reproducibly pinned.

Most local Matt skills do not include the upstream `agents/openai.yaml` metadata, so skills that upstream intends to be user-invoked can be exposed to Codex as implicit skills.

The local copies of `diagnosing-bugs`, `domain-modeling`, `grill-me`, `grill-with-docs`, `research`, `to-spec`, and `wayfinder` match the audited upstream main content.

The local copies of `grilling`, `setup-matt-pocock-skills`, `improve-codebase-architecture`, `writing-great-skills`, `handoff`, and `to-tickets` have drifted from current main.

The most material drift is in `grilling`, whose upstream version separates factual lookup from human decisions and adds confirmation before action, and in `improve-codebase-architecture`, whose upstream version scopes exploration to active code or a user-selected direction.

The local `subagent-driven-development` uses the earlier flat `.superpowers/sdd/` workspace and older fix-loop contract.

That file predates the plan-scoped workspace, resume-the-implementer loop, scoped re-review template, and five-round breaker introduced in Superpowers `v6.2.0`.

Updating only its `SKILL.md` would be unsafe because `v6.2.0` also changed its scripts and prompt templates.

### Dependency gaps

The available `writing-plans` instructs implementers to use TDD, but `test-driven-development` is absent.

The available `executing-plans` requires `using-git-worktrees` and `finishing-a-development-branch`, but both are absent.

The available `subagent-driven-development` requires the reviewer template under `requesting-code-review`, but that skill is absent.

The local `improve-codebase-architecture` explicitly requires `codebase-design`, but that skill is absent.

The local `wayfinder` names research and prototype resolvers, but `prototype` is absent.

The root workflow references `systematic-debugging`, `verification-before-completion`, `requesting-code-review`, and `receiving-code-review`, but none is currently available.

### Local skills that do not come from either audited catalog

`better-auth-best-practices`, `create-auth-skill`, `email-and-password-best-practices`, `organization-best-practices`, and `two-factor-authentication-best-practices` are local Better Auth skills rather than Matt Pocock or Superpowers skills.

`better-auth-best-practices` remains useful because Better Auth is an existing platform dependency.

`create-auth-skill` is inappropriate for a repository whose authentication topology, database schema, shared cookie, and token authority already exist.

The email-password, organization, and two-factor skills should be installed or restored when a concrete feature requires them instead of preloading speculative solution guidance.

## Exact keep, add, and remove set

### Keep

- `grill-with-docs`
- `grilling`
- `domain-modeling`
- `research`
- `triage`
- `to-spec`
- `to-tickets`
- `wayfinder`
- `writing-plans`
- `executing-plans`
- `subagent-driven-development`
- `better-auth-best-practices`

### Add from Matt Pocock

- `prototype`

### Add from Superpowers `v6.2.0`

- `systematic-debugging`
- `test-driven-development`
- `verification-before-completion`
- `requesting-code-review`
- `receiving-code-review`
- `using-git-worktrees`
- `finishing-a-development-branch`

`dispatching-parallel-agents` may be added if `AGENTS.md` explicitly restricts it to independent read-only investigations or non-overlapping work.

### Remove from the default Marliket stack

- `setup-matt-pocock-skills`, because its one-time configuration has already produced `docs/agents/`.
- `grill-me`, because `grill-with-docs` is the engineering wrapper and already reaches `grilling`.
- `handoff`, because normal delivery state should live in issues, specs, plans, commits, and the SDD ledger.
- `improve-codebase-architecture`, because the marketplace codebase is not built yet and the local copy is missing `codebase-design`.
- `writing-great-skills`, because it is meta-workflow guidance rather than a runtime delivery skill.
- `diagnosing-bugs`, because `systematic-debugging` should own the single debugging lane.
- `create-auth-skill`, because Marliket already has a custom Better Auth architecture.
- `email-and-password-best-practices`, because its narrow guidance can be restored when that subsystem changes.
- `organization-best-practices`, because dealer organization semantics have not been resolved in the domain model.
- `two-factor-authentication-best-practices`, because no current slice requires 2FA.

### Do not add

- Do not add Matt's `implement`, `tdd`, or `code-review` because Superpowers plus `no-mistakes` own those verbs.
- Do not add Superpowers `brainstorming` because `grill-with-docs` plus `to-spec` own alignment and specification.
- Do not add Superpowers `using-superpowers` because Codex discovers skills natively and repository routing should remain proportional.
- Do not add either catalog's skill-authoring skill to the default runtime stack.
- Do not add any Matt Pocock in-progress skill.

## Recommended proportional workflow

Read-only questions, status reports, and small factual documentation corrections should not trigger the delivery chain.

A focused code change should start on a Treehouse lease and use alignment only when requirements or domain language are unresolved.

User-visible behavior and bug fixes should use `test-driven-development`, with reproduction at the closest meaningful layer and E2E reproduction when practical.

A multi-step approved change should use `writing-plans`.

`executing-plans` should handle a small or tightly coupled plan, while `subagent-driven-development` should handle plans whose tasks each justify a fresh implementer and review gate.

`subagent-driven-development` must not be described as parallel implementation because the upstream skill explicitly prohibits parallel implementers that would conflict in one working tree.

Independent investigations may use parallel agents when they share no mutable state.

Every completion claim should pass `verification-before-completion`, followed by the repository's proportionate test, lint, build, and E2E evidence.

Substantive work should pass the Superpowers review process before `git push no-mistakes`.

Marliket's `AGENTS.md` should override generic Superpowers integration behavior by declaring Treehouse as the worktree owner, `git push no-mistakes` as the only publication path, and Treehouse return as post-merge cleanup.

A large, foggy initiative should use `wayfinder`, while an ordinary multi-slice specification should use `to-tickets` and a single focused slice should skip ticket decomposition.

## Installation and update policy

Catalog imports should be recorded in a small manifest containing the upstream repository, immutable tag or commit, import date, selected skill names, and any Marliket patches.

The Matt Pocock import should be pinned to `v1.1.0`.

The Superpowers import should be pinned to `v6.2.0`.

The retained Better Auth skill is vendored from upstream commit `6a1636950a1d7fc53602639ce7505a4a5d39c797` because `better-auth/skills` publishes no release tags.

Superpowers skills with cross-references must be updated as one dependency group rather than copied independently.

Skill imports should preserve every resource bundled with the pinned upstream release.

Project overrides should live in `AGENTS.md` or scoped `AGENTS.md` files rather than inside third-party skill bodies whenever possible.

Upstream skill bodies should remain unmodified unless a documented local patch is unavoidable.

Updates should be reviewed like dependency upgrades because skill text changes execution behavior.
