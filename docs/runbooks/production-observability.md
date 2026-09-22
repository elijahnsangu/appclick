# Production Observability Runbook

**Status:** Repository foundation prepared, Sentry provider setup pending, and Production traffic disabled.

**Applies to:** Sentry, Vercel, Cloudflare Workers, GitHub Actions, and the Marliket Production environment.

## Purpose

This runbook establishes the monitoring evidence required before Marliket can direct Production traffic.
It intentionally separates observability setup from deployment, database migration, domain promotion, and rollback execution.

## Service model

Marliket uses one monitoring boundary per independently deployable application.
This keeps ownership, releases, alert noise, and source maps isolated when one application fails.

| Deployable | Runtime | Primary telemetry | Project or service |
| --- | --- | --- | --- |
| Customer application | Vercel Next.js | Sentry errors and sampled traces | `marliket-app` |
| Marketing site | Vercel Next.js | Sentry errors and sampled traces | `marliket-web` |
| Professional application | Vercel Next.js | Sentry errors and sampled traces | `marliket-pro` |
| Operations application | Vercel Next.js | Sentry errors and sampled traces | `marliket-ops` |
| API and scheduled work | Cloudflare Worker | Privacy-safe application logs and metrics | `marliket-server-production` |

Use one Marliket Sentry organization with one `engineering` team and the four Next.js projects above.
Do not reuse a Trimor organization, project, client key, auth token, alert destination, or ownership team.
Do not create a Sentry Worker project for the initial launch because Cloudflare supplies native metrics and persists the Worker's privacy-safe application logs.
Revisit a shared OpenTelemetry destination only when cross-runtime correlation or longer retention justifies the additional system.

## Privacy and volume policy

The launch configuration sends errors and ten percent of transactions from the four Next.js applications.
It explicitly disables Sentry Logs, browser Session Replay, local-variable capture, and default personally identifiable information.
Cloudflare persists privacy-safe Worker application logs because initial traffic is expected to be low.
Cloudflare invocation logs and automatic traces remain disabled because their automatic attributes include full request URLs, R2 object keys, and checksum values that cannot yet be excluded.

Never place database URLs, authentication secrets, authorization headers, session cookies, document references, or submitted business data in application logs or Sentry context.
Use request IDs and opaque domain identifiers for correlation.
Treat telemetry access as Production access and require multi-factor authentication for every provider operator.

## Create the Sentry resources

Use the Marliket-controlled operator identity, preferably `nsangu@marliket.com`, as the initial organization owner.
Keep at least one recovery method outside the Sentry account and store recovery codes in the approved password manager.

1. Create the Sentry organization with the required slug `marliket`.
2. Create an `engineering` team owned by the Marliket operator.
3. Create four Next.js projects named and slugged `marliket-app`, `marliket-web`, `marliket-pro`, and `marliket-ops`.
4. Leave each project's default new-issue alert enabled until the explicit alert rules below have been verified.
5. Copy the public DSN from each project and record which deployable owns it.
6. Create one organization build token with `org:read` and `project:releases` scopes.
7. The read scope lets preflight prove project and client-key ownership, while the release scope permits source-map publication without organization administration, project administration, event deletion, or member management.
8. Store the token only in the GitHub `production` environment and the four Vercel Production environments written by automation.

The public DSNs identify ingestion endpoints and are not credentials.
The build token is a credential and must be rotated immediately if it appears in logs, commits, screenshots, shell history, or an unapproved system.

## Configure the protected GitHub environment

Add the following values to the existing GitHub environment named `production`.
The workflow preflight fails before provider writes if any value is absent.

### Variables

| Variable | Value |
| --- | --- |
| `SENTRY_ORG` | The required Marliket Sentry organization slug, `marliket`. |
| `SENTRY_APP_PROJECT` | `marliket-app` |
| `SENTRY_WEB_PROJECT` | `marliket-web` |
| `SENTRY_PRO_PROJECT` | `marliket-pro` |
| `SENTRY_OPS_PROJECT` | `marliket-ops` |
| `SENTRY_APP_DSN` | The public DSN from `marliket-app`. |
| `SENTRY_WEB_DSN` | The public DSN from `marliket-web`. |
| `SENTRY_PRO_DSN` | The public DSN from `marliket-pro`. |
| `SENTRY_OPS_DSN` | The public DSN from `marliket-ops`. |

### Secret

| Secret | Value |
| --- | --- |
| `SENTRY_AUTH_TOKEN` | The least-privilege Sentry build token used for release and source-map publication. |

Do not place the build token in repository-level secrets because only the protected Production workflow needs it.
Do not place a DSN under the wrong application name because that would merge telemetry and release ownership across deployables.

## Stage Production configuration without deploying

The repository change must first merge into `main` through no-mistakes.
Promote `main` to the protected `production` branch through a pull request whose merge commit contains `[skip ci]` so Vercel does not create an accidental Production build.

Dispatch `Configure production providers` from the `production` branch with the exact confirmation `CONFIGURE_PRODUCTION`.
The workflow performs the following observability work without creating or promoting a Vercel deployment:

1. It requires the `marliket` organization and exact four project slugs, proves every DSN is distinct, and uses the build token to match each active client key to its project.
2. It uploads a new undeployed Worker version so the Production Worker code, bindings, and compatibility settings are staged before any deployment.
3. It writes `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` into each matching Vercel Production environment.
4. It leaves Production domains, Worker routes, Worker deployments, database migrations, and personal-data processing unchanged.

Cloudflare `observability` settings are Worker-level configuration that wrangler applies at deployment time, so an uploaded version does not carry the persisted-log and automatic-telemetry settings from `wrangler.jsonc`.
The later production-promotion workflow must therefore apply Worker settings through a full `wrangler deploy --env production` rather than `wrangler versions deploy`, and must verify persisted application logs, disabled invocation logs, and disabled automatic traces after that deployment in the Cloudflare dashboard or through the Worker settings API.

After the workflow succeeds, inspect variable names and scopes without revealing their values.
Every Vercel project must contain exactly one matching Sentry project slug and DSN.
The Sentry build token must be marked sensitive.

## Configure alerts and uptime checks

Route Sentry notifications to `nsangu@marliket.com` initially.
Add another responder before public launch so a single mailbox or unavailable person cannot suppress incident awareness.

For each Sentry project, configure and test these minimum rules:

- Notify on a new Production error issue.
- Notify when a resolved Production issue regresses.
- Notify when unhandled Production errors exceed five events within five minutes.
- Group or suppress repeated notifications so one incident does not create unbounded alert noise.

Prepare uptime checks for the stable Production endpoints but do not mark them healthy before traffic exists.
At promotion time, enable checks for the following URLs at a one-minute interval when the selected Sentry plan supports that interval:

- `https://marliket.com`
- `https://app.marliket.com`
- `https://pro.marliket.com`
- `https://ops.marliket.com`
- `https://api.marliket.com/health`
- `https://api.marliket.com/ready`

The liveness check proves that the Worker can answer requests.
The readiness check separately proves that the Worker can reach the Production database through the runtime role.
Alert only after two consecutive failures when the provider supports that setting, which reduces noise from a single transient check without hiding a sustained outage.

## Verify the monitoring path

Monitoring is not ready merely because variables exist.
Capture evidence from each actual telemetry path before Production domain promotion.

### Vercel candidate verification

Use the later production-promotion workflow to build each application with its Production values and deploy it to an unpromoted Vercel candidate URL.
From each candidate, emit a synthetic exception with a unique marker that contains no user or business data.
Confirm the event arrives in the matching Sentry project with environment `production`, the expected release, and a readable source-mapped stack trace.
Confirm that the same event does not appear in any of the other three projects.
Resolve the synthetic issue after recording its event URL and timestamp in the promotion evidence.

### Worker candidate verification

Invoke `/health` on the uploaded version's version-preview URL so no Production route is required.
Invoke `/ready` only when the candidate is authorized to perform the non-data-bearing database ping.
Record the Worker version ID, request IDs, and UTC timestamps for these smoke requests without copying secrets or response headers that contain credentials.
Because observability settings apply only at deployment, complete the telemetry checks after the promotion workflow performs its full `wrangler deploy --env production` and before any route is attached.
Immediately after that deployment, repeat the smoke requests, confirm through the Cloudflare dashboard or Worker settings API that application logs persist while invocation logs and automatic traces remain disabled, and confirm the expected privacy-safe health event in Cloudflare Workers Observability.
Query for `$metadata.error EXISTS` and confirm the smoke requests did not produce an uncaught exception, then record the dashboard evidence.

### Alert delivery verification

Trigger one synthetic Sentry alert and one intentional uptime failure against a disposable or paused test endpoint.
Confirm both responders receive the notification and can reach the relevant issue or monitor.
Restore the endpoint or monitor immediately and confirm the incident resolves.

## Readiness record

Production monitoring is ready only when every item below is complete.

- [ ] The separate Marliket Sentry organization exists with multi-factor authentication enabled.
- [ ] The `engineering` team owns four isolated Next.js projects.
- [ ] GitHub Production contains every required Sentry variable and the protected build token.
- [ ] The setup-only workflow passes from the protected `production` branch.
- [ ] Each Vercel project contains the matching Production Sentry values.
- [ ] The Production Worker version is uploaded without a route or deployment, and the promotion plan applies persisted application logs with automatic telemetry disabled through a full `wrangler deploy --env production`.
- [ ] Each Vercel candidate delivers a source-mapped synthetic error to only its matching project.
- [ ] Worker candidate liveness, readiness, application-log, error-query, and automatic-telemetry-disablement evidence is recorded.
- [ ] New-issue, regression, error-rate, and uptime notification paths reach two responders.
- [ ] No telemetry sample contains credentials, session data, personal data, or submitted business data.
- [ ] The rollback drill identifies the exact dashboards, queries, and thresholds used to decide rollback.

Do not check the repository's Production monitoring gate until every item is evidenced.

## Failure response

| Failure | Required response |
| --- | --- |
| Setup preflight rejects a Sentry value | Correct the organization, exact project slug, distinct active DSN mapping, or build-token access before rerunning because no provider write occurred. |
| A Sentry event reaches the wrong project | Stop promotion, correct the DSN and project slug mapping, rerun setup, and repeat all four isolation checks. |
| A stack trace is not source mapped | Stop promotion and verify the project slug, organization slug, build token scope, release, and build output. |
| Sensitive data appears in telemetry | Stop promotion, delete or restrict the affected event where supported, rotate exposed credentials, and correct instrumentation before retesting. |
| Worker application logs are absent or automatic telemetry is enabled | Confirm the promotion performed a full `wrangler deploy --env production`, verify the Worker-level observability settings in the Cloudflare dashboard or Worker settings API, and repeat the smoke requests. |
| `/health` fails | Treat the Worker candidate as invalid and inspect startup or routing errors before any deployment. |
| `/ready` fails | Leave traffic disabled and diagnose the Production runtime database role, connection, and Neon availability. |
| An alert does not reach both responders | Correct notification routing and repeat the delivery test before promotion. |
| Telemetry volume is unexpectedly high | Stop synthetic load, inspect release and environment filters, then reduce sampling or add inbound filters before promotion. |

## Rollback handoff

Observability supplies the evidence for rollback but does not perform rollback.
The next readiness slice must rehearse application rollback on Shared Preview, record the previous Worker deployment and Vercel deployment identifiers before promotion, define stop conditions, and prove that health checks recover after restoration.
Database migrations are never rolled back automatically.
When an application rollback is incompatible with the migrated schema, use a reviewed forward-fix migration or an explicitly approved Neon restore procedure.

## References

- [Cloudflare Workers observability](https://developers.cloudflare.com/workers/observability/)
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Cloudflare Workers traces](https://developers.cloudflare.com/workers/observability/traces/)
- [Cloudflare Worker errors and log queries](https://developers.cloudflare.com/workers/observability/errors/)
- [Sentry project creation API reference](https://docs.sentry.io/api/projects/create-a-new-project/)
- [Sentry client key API reference](https://docs.sentry.io/api/projects/create-a-new-client-key/)
- [Sentry release API scopes](https://docs.sentry.io/api/releases/retrieve-an-organizations-release/)
