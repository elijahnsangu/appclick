# Marliket

Marliket is an automotive marketplace where businesses with approved marketplace roles publish vehicles, vehicle parts, vehicle accessories, and vehicle insurance for customers to discover and inquire about.
This Turborepo uses Next.js on Vercel, a Hono API on Cloudflare Workers, Drizzle with PostgreSQL, Better Auth, and a shared shadcn/Tailwind design system.
The marketplace domain currently includes Business identity, Representative Authorization, independent Marketplace Role approval, the complete Standard Vehicle Listing slice, public Vehicle discovery, and narrow public Business profiles on top of the platform skeleton.

## Instruction map

- `AGENTS.md` is canonical, while `CLAUDE.md` and `GEMINI.md` are compatibility symlinks to it.
- Read `CONTEXT.md` before naming domain concepts, and update it only through the domain-modeling workflow when terminology is resolved.
- Read relevant ADRs under `docs/adr/` before changing an established decision.
- Read `apps/server/AGENTS.md` before changing the Hono or Cloudflare Worker app.
- Read `docs/agents/repository-guide.md` for the detailed app, package, environment, and architecture map.
- Read `docs/agents/dev-flow.md` for workflow and skill routing details.
- Read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` for tracker operations.
- Read `docs/agents/domain.md` for domain documentation conventions.

## Working standards

- Never use the em dash character.
- Keep one complete sentence per physical line in long Markdown prose while preserving normal Markdown structure.
- Never add an agent as a commit co-author.
- Never manually edit `CHANGELOG.md`, generated migrations, generated shadcn primitives, or other generated files.
- Prefer quality, simplicity, robustness, scalability, and long-term maintainability over short-term development cost.
- Preserve user changes and unrelated dirty-worktree state.
- Keep the active change focused.
- Fix related defects and anything blocking verification.
- Report unrelated findings separately unless they are trivial, safe, and clearly within the active change.
- Reproduce bugs at the closest meaningful layer before fixing them.
- Reproduce user-visible bugs E2E whenever practical, then add the lowest-cost regression test that protects the behavior.
- Treat UI verification as visual QA, including responsive behavior, interaction states, accessibility, and pixel-level fit and finish.
- Do not claim completion without fresh verification output appropriate to the change.

## Commands

Run commands from the repository root unless a focused command says otherwise.
pnpm is pinned through Corepack.

- `pnpm install` installs dependencies and wires `.githooks/` through the root `prepare` script.
- `pnpm dev` starts all applications through Turbo.
- `pnpm build` builds the monorepo and includes tests as dependencies.
- `pnpm test` runs all Vitest suites.
- `pnpm check` runs the full Ultracite and Biome check.
- `pnpm fix` applies supported formatting and lint fixes.
- `pnpm migrate` applies Drizzle migrations using `DATABASE_URL_ROOT`.
- `pnpm db:drizzle:generate` generates a migration from schema changes using `DATABASE_URL_ROOT`.
- `pnpm db:push` pushes schema directly for development only.
- `pnpm bump-ui` refreshes generated shadcn primitives.
- `pnpm --filter <workspace> <script>` runs a focused workspace command.
- `NODE_ENV=test vitest run <path> -t "<name>"` runs a focused test from its workspace.

Fresh setup is `corepack enable pnpm`, `pnpm install`, and `pnpm migrate` with database variables configured in `packages/database/.env`.

## Repository invariants

- Put deployable applications under `apps/` and shared platform or domain capabilities under `packages/`.
- Add environment variables to the owning package's `keys.ts`, then compose that package's `keys()` into consuming app `env.ts` files.
- Import the database through `@repo/database`, keep schema under `packages/database/drizzle/`, and generate migrations rather than writing them manually.
- Register client-consumed server routes in the typed contract at `apps/server/src/rpc.ts`.
- Create marketplace domain packages as pure policy cores with database-aware services layered on top.
- Prefer `@/` imports inside an app and `@repo/<package>` imports across workspaces.
- Keep App Router components server-side by default and add client boundaries only when browser behavior requires them.
- Do not hand-edit files under `packages/design-system/components/ui/`.
- Preserve `instrumentation.ts`, `instrumentation-client.ts`, and `sentry.*.config.ts` when changing Next.js configuration.
- Use `NextProxy`, not `NextMiddleware`, for application proxy conventions in this repository.

## Proportional workflow

Scale the process to uncertainty, blast radius, reversibility, and user impact.

### Read-only work

Investigation, explanation, review, and status reporting do not require a worktree, specification, or implementation plan.
Inspect the repository and return evidence without making external or repository changes unless the user requested them.

### Small focused changes

Small documentation, configuration, dependency, test, and localized code changes may skip formal alignment, specification, tickets, and plan documents when requirements are already clear.
Use a Treehouse lease before editing work intended for a pull request.
Reproduce defects where applicable, implement the smallest complete change, run focused verification, review the diff, and publish every in-scope change intended for origin through `git push no-mistakes`.

### Substantive changes

Use `grill-with-docs` when terminology, behavior, boundaries, or costly decisions need alignment.
Use `to-spec` after alignment for product or behavior changes that need a durable contract.
Use `to-tickets` only when a specification needs multiple independently deliverable slices.
Use `writing-plans` followed by `executing-plans` for tightly coupled multi-step work.
Use `subagent-driven-development` only when plan tasks each justify a fresh implementer and review gate and the active environment permits delegation.
Use `test-driven-development` for behavior changes and `systematic-debugging` for defects.
Finish with `verification-before-completion`, proportionate review, and the no-mistakes publication gate.

### Large or foggy initiatives

Use `wayfinder` before alignment when the effort is too large for one session and the path is not yet visible.
Resolve the decision map before collapsing the initiative into specifications and tracer-bullet slices.

The detailed routing table and collision rules live in `docs/agents/dev-flow.md`.

## Skill ownership

- Matt Pocock skills own alignment, domain modeling, primary-source research, issue triage, specification, ticket slicing, prototyping, and initiative wayfinding.
- Superpowers skills own implementation planning, plan execution, TDD, debugging, verification, and review discipline.
- `better-auth-best-practices` is the only always-installed feature reference because Better Auth is an existing security-critical platform dependency.
- `better-auth-best-practices` is vendored from `better-auth/skills` commit `6a1636950a1d7fc53602639ce7505a4a5d39c797` because upstream publishes no release tags.
- Install narrow feature skills only when a concrete slice needs them.
- Do not add a second skill for an owned workflow verb.
- Use `skills-lock.json` as the reproducible project manifest, and change it only through the `skills` CLI.
- Update a skill catalog from an immutable release when upstream publishes one, retain the CLI-computed content hash, and review the update like a dependency change.
- Keep third-party skill bodies unmodified, and express Marliket overrides in `AGENTS.md` or a scoped `AGENTS.md`.
- Treat Matt's `implement` as `writing-plans` followed by `executing-plans` or `subagent-driven-development`.
- Treat Matt's `setup-matt-pocock-skills` as already satisfied by the repository documents under `docs/agents/`.

## Toolchain

- Use `treehouse get --lease --lease-holder <slice-name>` for isolated implementation work, and return the lease only after its PR merges.
- Treehouse replaces the workspace-creation behavior in `using-git-worktrees`, which remains installed only as a Superpowers dependency.
- Use `gh-axi` for GitHub operations, falling back to raw `gh` only for unsupported operations.
- Use `lavish-axi` when a plan, diagram, comparison, mockup, or HTML review surface benefits from visual iteration.
- Use `git push no-mistakes` instead of pushing directly to origin for repository changes that matter.
- No-mistakes replaces the integration choices in `finishing-a-development-branch`, which remains installed only as a Superpowers dependency.
- Use `rg` and `rg --files` for text and file discovery.

## Definition of done

- The requested behavior or documentation is complete and scoped.
- Relevant focused tests pass, and broader checks run in proportion to blast radius.
- `pnpm check` passes for repository changes unless the task has a documented narrower gate.
- User-visible changes are exercised through the real interface whenever practical.
- The final diff is reviewed for correctness, regressions, accidental generated-file edits, and unrelated changes.
- Domain language and ADRs are updated only when the change resolves terminology or a costly decision.
- The handoff reports what changed, what was verified, and any remaining risks or unrelated findings.
