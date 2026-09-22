import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from "@playwright/test";
import type {
  MarketplaceRole,
  MarketplaceRoleChecklistItem,
  MarketplaceRoleSubmission,
} from "@repo/business";
import {
  marketplaceRoleActors,
  marketplaceRoleBeforeExpiryClock,
  marketplaceRoleChecklists,
  marketplaceRoleExpiredClock,
  marketplaceRoleFixture,
  marketplaceRoleSubmissions,
} from "./fixtures/marketplace-roles.ts";
import {
  betterAuthSessionCookieName,
  signBetterAuthSessionToken,
} from "./helpers/auth-session.ts";
import {
  type FocusIndicatorStyle,
  hasVisibleFocusDifference,
} from "./helpers/focus-indicator.ts";
import {
  cleanupMarketplaceRoleScenario,
  marketplaceRoleAuditSnapshot,
  marketplaceRoleDatabaseState,
  marketplaceRoleDomainSnapshot,
  marketplaceRolePersistenceSnapshot,
  marketplaceRoleScenarioDomainSnapshot,
  openMarketplaceRoleE2eDatabase,
  persistLegacyPendingMarketplaceRoleCaseState,
  seedApprovedMarketplaceRoleAuthority,
} from "./helpers/marketplace-role-database.ts";
import { apiOrigin, opsOrigin, proOrigin } from "./helpers/origins.ts";

const secret =
  process.env.BETTER_AUTH_SECRET ??
  "issue-44-e2e-secret-that-is-at-least-32-characters";
const submitButtonPattern =
  /Submit for review|Submit fresh application|Correct and resubmit/;
const retiredApprovalLabel = /second approval/i;

interface Actor {
  readonly token: string;
}

interface BrowserHttpResult<T = Record<string, unknown>> {
  readonly body: {
    readonly data?: T;
    readonly error?: { readonly code: string; readonly message: string };
    readonly ok: boolean;
    readonly requestId: string;
  };
  readonly status: number;
}

interface BrowserHttpInput {
  readonly body?: unknown;
  readonly fixedNow?: string;
  readonly idempotencyKey?: string;
  readonly method?: string;
  readonly path: string;
}

interface PortfolioSummary {
  readonly applicationState: string | null;
  readonly attestationStatus: string | null;
  readonly businessExplanation: string | null;
  readonly continuingState: string | null;
  readonly correctionMessage: string | null;
  readonly correctivePath: string | null;
  readonly eligible: boolean;
  readonly evidenceExpiresAt: string | null;
  readonly evidenceStatus: string | null;
  readonly lifecycleNumber: number | null;
  readonly nextAttestationAt: string | null;
  readonly priorLifecycleCount: number;
  readonly reconsiderationStatus: string;
  readonly reconsiderationUntil: string | null;
  readonly role: MarketplaceRole;
}

type Sql = Awaited<ReturnType<typeof openMarketplaceRoleE2eDatabase>>;

let sql: Sql;

test.describe.configure({ mode: "serial", retries: 0, timeout: 300_000 });

test.beforeAll(async () => {
  sql = await openMarketplaceRoleE2eDatabase();
  await cleanupMarketplaceRoleScenario(sql);
  await seedApprovedMarketplaceRoleAuthority(sql);
});

test.afterAll(async () => {
  if (sql) {
    await cleanupMarketplaceRoleScenario(sql);
    await sql.end();
  }
});

async function authenticatedContext(
  browser: Browser,
  actor: Actor,
  viewport = { height: 1000, width: 1440 }
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  await context.route("https://va.vercel-scripts.com/**", (route) =>
    route.fulfill({ status: 204 })
  );
  await context.addCookies([
    {
      domain: "localhost",
      httpOnly: true,
      name: betterAuthSessionCookieName,
      path: "/",
      sameSite: "Lax",
      secure: false,
      value: signBetterAuthSessionToken(actor.token, secret),
    },
  ]);
  return context;
}

function watchBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "";
    if (errorText !== "net::ERR_ABORTED") {
      failures.push(
        `requestfailed: ${request.method()} ${request.url()} ${errorText}`
      );
    }
  });
  return failures;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    )
    .toBe(true);
}

async function expectEveryFormControlLabelled(page: Page) {
  const unlabelled = await page
    .locator("input:not([type=hidden]), select, textarea")
    .evaluateAll((controls) =>
      controls
        .filter((control) => {
          const element = control as HTMLInputElement;
          return !(
            element.labels?.length ||
            element.getAttribute("aria-label") ||
            element.getAttribute("aria-labelledby")
          );
        })
        .map((control) => (control as HTMLElement).outerHTML)
    );
  expect(unlabelled).toEqual([]);
}

async function focusIndicatorStyle(
  control: Locator
): Promise<FocusIndicatorStyle> {
  return await control.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      boxShadow: computed.boxShadow,
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth),
    };
  });
}

async function expectFocusedWithVisibleIndicator(
  control: Locator,
  unfocusedStyle: FocusIndicatorStyle
) {
  await expect(control).toBeFocused();
  expect(
    hasVisibleFocusDifference(
      await focusIndicatorStyle(control),
      unfocusedStyle
    )
  ).toBe(true);
}

async function expectVisibleFocus(control: Locator) {
  await expect(control).not.toBeFocused();
  const unfocusedStyle = await focusIndicatorStyle(control);
  await control.focus();
  await control.page().keyboard.press("Tab");
  await expect(control).not.toBeFocused();
  await control.page().keyboard.press("Shift+Tab");
  await expectFocusedWithVisibleIndicator(control, unfocusedStyle);
}

async function pressAndExpectFocus(
  page: Page,
  key: "Shift+Tab" | "Tab",
  control: Locator
) {
  await expect(control).not.toBeFocused();
  const unfocusedStyle = await focusIndicatorStyle(control);
  await page.keyboard.press(key);
  await expectFocusedWithVisibleIndicator(control, unfocusedStyle);
}

async function pressWithinNativeDateControl(
  page: Page,
  key: "Shift+Tab" | "Tab",
  source: Locator,
  target: Locator,
  maximumPresses = 8
) {
  await expect(source).toBeFocused();
  await expect(target).not.toBeFocused();
  const pressUntilTarget = async (remainingPresses: number): Promise<void> => {
    if (remainingPresses === 0) {
      throw new Error(
        `The expected control did not receive focus after ${maximumPresses} ${key} presses.`
      );
    }
    await page.keyboard.press(key);
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      await expect(target).toBeFocused();
      return;
    }
    await expect(source).toBeFocused();
    return pressUntilTarget(remainingPresses - 1);
  };
  await pressUntilTarget(maximumPresses);
}

async function browserHttp<T>(
  page: Page,
  input: BrowserHttpInput
): Promise<BrowserHttpResult<T>> {
  return await page.evaluate(
    async ({ apiOriginValue, request }) => {
      const response = await fetch(`${apiOriginValue}${request.path}`, {
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        credentials: "include",
        headers: {
          ...(request.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          ...(request.idempotencyKey
            ? { "idempotency-key": request.idempotencyKey }
            : {}),
          ...(request.fixedNow
            ? { "x-marliket-e2e-now": request.fixedNow }
            : {}),
        },
        method: request.method ?? "GET",
      });
      return { body: await response.json(), status: response.status };
    },
    { apiOriginValue: apiOrigin, request: input }
  );
}

async function sessionHttp<T>(
  page: Page,
  input: BrowserHttpInput
): Promise<BrowserHttpResult<T>> {
  const response = await page
    .context()
    .request.fetch(`${apiOrigin}${input.path}`, {
      data: input.body,
      headers: {
        ...(input.idempotencyKey
          ? { "idempotency-key": input.idempotencyKey }
          : {}),
        ...(input.fixedNow ? { "x-marliket-e2e-now": input.fixedNow } : {}),
      },
      method: input.method ?? "GET",
    });
  return {
    body: await response.json(),
    status: response.status(),
  };
}

function expectAccessDenialAudits(
  before: Record<string, unknown>[],
  after: Record<string, unknown>[],
  expected: {
    readonly accountId: string;
    readonly code: "BUSINESS_NOT_SELECTED" | "PERMISSION_DENIED";
    readonly requestedBusinessId: string;
  }
) {
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after.slice(before.length)).toEqual(
    Array.from({ length: 2 }, () => ({
      accountId: expected.accountId,
      applicationId: null,
      businessId: null,
      caseId: null,
      code: expected.code,
      id: expect.any(String),
      kind: "MARKETPLACE_ROLE_ACCESS_DENIED",
      marketplaceRoleApplicationId: null,
      marketplaceRoleDecisionId: null,
      marketplaceRoleId: null,
      occurredAt: expect.any(String),
      requestedBusinessId: expected.requestedBusinessId,
    }))
  );
}

function summaryFor(
  summaries: readonly PortfolioSummary[],
  role: MarketplaceRole
) {
  const summary = summaries.find((candidate) => candidate.role === role);
  if (!summary) {
    throw new Error(`Expected ${role} in the Marketplace Role portfolio.`);
  }
  return summary;
}

function canonicalRoleFor(
  roles: readonly Record<string, unknown>[],
  role: MarketplaceRole
) {
  const record = roles.find((candidate) => candidate.role === role);
  if (!record) {
    throw new Error(`Expected ${role} in the canonical role snapshot.`);
  }
  return record;
}

async function expectSuccessfulEnvelope(
  response: Response,
  expected: Record<string, unknown>
) {
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({
    data: expected,
    ok: true,
    requestId: expect.any(String),
  });
}

async function mutation(
  page: Page,
  method: string,
  path: string,
  action: () => Promise<void>
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === path
  );
  await action();
  return await responsePromise;
}

const evidenceLabels = {
  ACCOUNTABLE_INSTITUTION_ATTESTATION: "Accountable institution attestation",
  INSURANCE_PUBLISHING_AUTHORIZATION: "Insurance publishing authorization",
  PIA_REGISTER_ENTRY: "PIA register entry",
  RTSA_DEALER_COMPLIANCE: "RTSA dealer compliance",
  ZRA_STATUS: "ZRA status",
} as const;

async function fillMarketplaceRoleApplication(
  page: Page,
  submission: MarketplaceRoleSubmission
) {
  for (const item of submission.evidence) {
    const group = page.getByRole("group", {
      name: evidenceLabels[item.kind],
    });
    // biome-ignore lint/performance/noAwaitInLoops: Browser form actions must settle in deliberate user order.
    await group.getByLabel("Evidence identifier").fill(item.id, {
      timeout: 10_000,
    });
    await group.getByLabel("Evidence description").fill(item.displayName, {
      timeout: 10_000,
    });
    await group.getByLabel("Private HTTPS source URL").fill(item.sourceUrl, {
      timeout: 10_000,
    });
    await group
      .getByLabel("Private evidence-store reference")
      .fill(item.storageReference, { timeout: 10_000 });
    await group
      .getByLabel("Issued date")
      .fill(item.issuedAt, { timeout: 10_000 });
    await group
      .getByLabel("Valid until")
      .fill(item.validUntil, { timeout: 10_000 });
  }
  const declarations = page.getByRole("checkbox");
  await declarations.evaluateAll((checkboxes) => {
    for (const checkbox of checkboxes) {
      const input = checkbox as HTMLInputElement;
      if (!input.checked) {
        input.click();
      }
    }
  });
  await Promise.all(
    (await declarations.all()).map((checkbox) => expect(checkbox).toBeChecked())
  );
}

const checklistLabels: Readonly<Record<string, string>> = {
  "accountable-institution-attestation": "Accountable institution attestation",
  "approved-business-identity": "Approved Business identity",
  "insurance-publishing-authorization": "Insurance publishing authorization",
  "pia-register-entry": "PIA register entry",
  "role-declarations": "Role declarations",
  "rtsa-dealer-compliance": "RTSA dealer compliance",
  "zra-status": "Current ZRA status",
};

async function setChecklist(
  page: Page,
  checklist: readonly MarketplaceRoleChecklistItem[]
) {
  const stateLabels: Readonly<
    Record<MarketplaceRoleChecklistItem["state"], string>
  > = {
    FAILED: "Failed",
    NOT_APPLICABLE: "Not applicable",
    PASSED: "Passed",
    UNRESOLVED: "Unresolved",
  };
  for (const item of checklist) {
    const fieldset = page.getByRole("group", {
      name: checklistLabels[item.key],
    });
    // biome-ignore lint/performance/noAwaitInLoops: React checklist updates must preserve deliberate user order.
    await fieldset.getByLabel(stateLabels[item.state], { exact: true }).click();
  }
}

function roleCard(page: Page, roleName: string) {
  return page.locator("article, [data-slot=card]").filter({
    has: page.getByRole("heading", { exact: true, name: roleName }),
  });
}

async function saveAndSubmitRole(
  page: Page,
  role: MarketplaceRole,
  submission: MarketplaceRoleSubmission
) {
  const basePath = `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/${role}/application`;
  await fillMarketplaceRoleApplication(page, submission);
  const putResponse = mutation(page, "PUT", basePath, async () => {
    await page.getByRole("button", { name: "Save draft" }).click();
  });
  await expectSuccessfulEnvelope(await putResponse, {
    applicationId: expect.any(String),
    kind: "DRAFT_SAVED",
    state: expect.any(String),
  });
  await expect(page.getByText("Draft saved.")).toBeVisible();

  const submitResponse = mutation(
    page,
    "POST",
    `${basePath}/submit`,
    async () => {
      await page.getByRole("button", { name: submitButtonPattern }).click();
    }
  );
  const response = await submitResponse;
  expect(response.status()).toBe(200);
  const envelope = await response.json();
  expect(envelope).toEqual({
    data: {
      applicationId: expect.any(String),
      caseId: expect.any(String),
      kind: "SUBMITTED",
      revisionId: expect.any(String),
      revisionNumber: expect.any(Number),
      state: "SUBMITTED",
    },
    ok: true,
    requestId: expect.any(String),
  });
  await expect(
    page.getByText("Application submitted for review.")
  ).toBeVisible();
  return envelope.data as {
    applicationId: string;
    caseId: string;
    revisionId: string;
    revisionNumber: number;
  };
}

async function startReview(page: Page, caseId: string) {
  const response = await mutation(
    page,
    "POST",
    `/v1/operations/marketplace-role-cases/${caseId}/start-review`,
    async () => {
      await page.getByRole("button", { name: "Start review" }).click();
    }
  );
  await expectSuccessfulEnvelope(response, {
    applicationId: expect.any(String),
    caseId,
    kind: "REVIEW_STARTED",
    revisionId: expect.any(String),
  });
  await expect(
    page.getByRole("heading", { name: "Exact role checklist" })
  ).toBeVisible();
}

test("Vehicle Dealer moves from corrected application to independent active eligibility", async ({
  browser,
}) => {
  const adminContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.administrator
  );
  const proPage = await adminContext.newPage();
  const proFailures = watchBrowserFailures(proPage);
  const rolePath = `/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/VEHICLE_DEALER`;
  await proPage.goto(`${proOrigin}${rolePath}`);

  await expect(
    proPage.getByRole("heading", { name: "Vehicle Dealer application" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(proPage);
  await expectEveryFormControlLabelled(proPage);
  await expectVisibleFocus(proPage.getByRole("button", { name: "Save draft" }));

  const firstIdentifier = proPage.getByLabel("Evidence identifier").first();
  const firstDescription = proPage.getByLabel("Evidence description").first();
  const firstSourceUrl = proPage.getByLabel("Private HTTPS source URL").first();
  const firstStorageReference = proPage
    .getByLabel("Private evidence-store reference")
    .first();
  const firstIssuedAt = proPage.getByLabel("Issued date").first();
  const firstValidUntil = proPage.getByLabel("Valid until").first();
  await expectVisibleFocus(firstIdentifier);
  await pressAndExpectFocus(proPage, "Tab", firstDescription);
  await pressAndExpectFocus(proPage, "Tab", firstSourceUrl);
  await pressAndExpectFocus(proPage, "Tab", firstStorageReference);
  await pressAndExpectFocus(proPage, "Tab", firstIssuedAt);
  await pressWithinNativeDateControl(
    proPage,
    "Tab",
    firstIssuedAt,
    firstValidUntil
  );
  await pressWithinNativeDateControl(
    proPage,
    "Shift+Tab",
    firstValidUntil,
    firstIssuedAt
  );
  await pressWithinNativeDateControl(
    proPage,
    "Tab",
    firstIssuedAt,
    firstValidUntil
  );

  const lastDeclaration = proPage.getByRole("checkbox", {
    name: "I will report material changes affecting this Marketplace Role.",
  });
  const saveDraftButton = proPage.getByRole("button", { name: "Save draft" });
  const submitButton = proPage.getByRole("button", {
    name: "Submit for review",
  });
  await expectVisibleFocus(lastDeclaration);
  await pressAndExpectFocus(proPage, "Tab", saveDraftButton);
  await pressAndExpectFocus(proPage, "Tab", submitButton);
  await pressAndExpectFocus(proPage, "Shift+Tab", saveDraftButton);

  const stickyActions = proPage.locator("div.sticky").filter({
    has: proPage.getByRole("button", { name: "Save draft" }),
  });
  await stickyActions.scrollIntoViewIfNeeded();
  await expect(stickyActions).toBeVisible();
  await expect
    .poll(() =>
      stickyActions.evaluate((element) => getComputedStyle(element).position)
    )
    .toBe("sticky");
  await proPage.evaluate(() => window.scrollBy(0, -300));
  await expect(stickyActions).toBeInViewport();
  await proPage.evaluate(() => window.scrollBy(0, 200));
  await expect(stickyActions).toBeInViewport();

  await proPage.getByRole("button", { name: "Submit for review" }).click();
  const errorSummary = proPage.getByRole("alert").filter({
    has: proPage.getByRole("heading", { name: "Check the highlighted fields" }),
  });
  await expect(errorSummary).toBeFocused();
  await expect(
    proPage.getByLabel("Evidence identifier").first()
  ).toHaveAttribute("aria-invalid", "true");

  const firstSubmission = await saveAndSubmitRole(
    proPage,
    "VEHICLE_DEALER",
    marketplaceRoleSubmissions.VEHICLE_DEALER
  );

  const reviewerContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.reviewerOne
  );
  const opsPage = await reviewerContext.newPage();
  const opsFailures = watchBrowserFailures(opsPage);
  await opsPage.goto(
    `${opsOrigin}/marketplace-role-cases/${firstSubmission.caseId}`
  );
  await expect(
    opsPage.getByRole("heading", { name: "Private evidence" })
  ).toBeVisible();
  await expect(
    opsPage.getByText(
      marketplaceRoleSubmissions.VEHICLE_DEALER.evidence[1].storageReference,
      { exact: true }
    )
  ).toBeVisible();
  await expectNoHorizontalOverflow(opsPage);
  await startReview(opsPage, firstSubmission.caseId);
  const identityChecklist = opsPage.getByRole("group", {
    name: "Approved Business identity",
  });
  const zraChecklist = opsPage.getByRole("group", {
    name: "Current ZRA status",
  });
  const identityUnresolved = identityChecklist.getByLabel("Unresolved", {
    exact: true,
  });
  const zraUnresolved = zraChecklist.getByLabel("Unresolved", { exact: true });
  await expectVisibleFocus(identityUnresolved);
  await pressAndExpectFocus(opsPage, "Tab", zraUnresolved);
  await pressAndExpectFocus(opsPage, "Shift+Tab", identityUnresolved);
  await setChecklist(opsPage, marketplaceRoleChecklists.vehicleCorrection);
  await opsPage
    .getByLabel("Consolidated correction")
    .fill(marketplaceRoleFixture.correctionMessage);
  const firstReviewInternalNote = opsPage.getByLabel("Internal reviewer note");
  const requestChangesButton = opsPage.getByRole("button", {
    name: "Changes Requested",
  });
  await expectVisibleFocus(firstReviewInternalNote);
  await pressAndExpectFocus(opsPage, "Tab", requestChangesButton);
  await pressAndExpectFocus(opsPage, "Shift+Tab", firstReviewInternalNote);
  const changesResponse = await mutation(
    opsPage,
    "POST",
    `/v1/operations/marketplace-role-cases/${firstSubmission.caseId}/request-changes`,
    async () => {
      await opsPage.getByRole("button", { name: "Changes Requested" }).click();
    }
  );
  await expectSuccessfulEnvelope(changesResponse, {
    applicationId: firstSubmission.applicationId,
    caseId: firstSubmission.caseId,
    kind: "CHANGES_REQUESTED",
    revisionId: firstSubmission.revisionId,
  });

  await proPage.reload();
  await expect(
    proPage.getByText(marketplaceRoleFixture.correctionMessage, { exact: true })
  ).toBeVisible();
  const rtsaGroup = proPage.getByRole("group", {
    name: "RTSA dealer compliance",
  });
  await rtsaGroup
    .getByLabel("Evidence description")
    .fill(marketplaceRoleFixture.correctedRtsaDescription);
  const resubmitResponsePromise = mutation(
    proPage,
    "POST",
    `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/VEHICLE_DEALER/application/submit`,
    async () => {
      await proPage
        .getByRole("button", { name: "Correct and resubmit" })
        .click();
    }
  );
  const resubmitResponse = await resubmitResponsePromise;
  expect(resubmitResponse.status()).toBe(200);
  const resubmitEnvelope = await resubmitResponse.json();
  expect(resubmitEnvelope).toEqual({
    data: {
      applicationId: firstSubmission.applicationId,
      caseId: expect.any(String),
      kind: "SUBMITTED",
      revisionId: expect.any(String),
      revisionNumber: 2,
      state: "SUBMITTED",
    },
    ok: true,
    requestId: expect.any(String),
  });
  const secondCaseId = resubmitEnvelope.data.caseId as string;

  await opsPage.goto(`${opsOrigin}/marketplace-role-cases/${secondCaseId}`);
  await startReview(opsPage, secondCaseId);
  await setChecklist(opsPage, marketplaceRoleChecklists.vehiclePassed);
  const approvalInternalNote = opsPage.getByLabel("Internal reviewer note");
  const approveRoleButton = opsPage.getByRole("button", {
    name: "Approve role",
  });
  await expectVisibleFocus(approvalInternalNote);
  await pressAndExpectFocus(opsPage, "Tab", approveRoleButton);
  await pressAndExpectFocus(opsPage, "Shift+Tab", approvalInternalNote);
  const approvalResponse = await mutation(
    opsPage,
    "POST",
    `/v1/operations/marketplace-role-cases/${secondCaseId}/decision`,
    async () => {
      await opsPage.getByRole("button", { name: "Approve role" }).click();
    }
  );
  expect(approvalResponse.status()).toBe(200);
  const approvalEnvelope = await approvalResponse.json();
  expect(approvalEnvelope).toEqual({
    data: {
      applicationId: firstSubmission.applicationId,
      caseId: secondCaseId,
      decisionId: expect.any(String),
      kind: "APPLIED",
      reconsiderationUntil: null,
      revisionId: resubmitEnvelope.data.revisionId,
      role: "VEHICLE_DEALER",
      roleId: expect.any(String),
      state: "ACTIVE",
    },
    ok: true,
    requestId: expect.any(String),
  });

  await proPage.goto(
    `${proOrigin}/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`
  );
  const vehicleCard = roleCard(proPage, "Vehicle Dealer");
  await expect(vehicleCard.getByText("Active", { exact: true })).toBeVisible();
  await Promise.all(
    ["Parts Seller", "Accessories Seller", "Insurance Provider"].map(
      (roleName) =>
        expect(
          roleCard(proPage, roleName).getByText("Not eligible", { exact: true })
        ).toBeVisible()
    )
  );
  await expect(proPage.getByText("private-evidence:")).toHaveCount(0);

  const state = await marketplaceRoleDatabaseState(sql);
  expect(state.applications).toEqual([
    expect.objectContaining({
      latestRevisionNumber: 2,
      role: "VEHICLE_DEALER",
      state: "APPROVED",
    }),
  ]);
  expect(state.revisions).toHaveLength(2);
  expect(state.revisions[0]?.submission).toMatchObject({
    evidence: expect.arrayContaining([
      expect.objectContaining({
        displayName: "RTSA dealer record requiring correction",
        kind: "RTSA_DEALER_COMPLIANCE",
      }),
    ]),
  });
  expect(state.revisions[1]?.submission).toMatchObject({
    evidence: expect.arrayContaining([
      expect.objectContaining({
        displayName: marketplaceRoleFixture.correctedRtsaDescription,
        kind: "RTSA_DEALER_COMPLIANCE",
      }),
    ]),
  });
  expect(state.checklist).toHaveLength(10);
  expect(state.caseEvents.map((event) => event.kind)).toEqual(
    expect.arrayContaining([
      "APPLICATION_SUBMITTED",
      "REVIEW_STARTED",
      "CHANGES_REQUESTED",
      "APPLICATION_CORRECTION_SUPERSEDED",
      "APPLICATION_CORRECTION_SUBMITTED",
      "APPROVE_APPLIED",
    ])
  );
  expect(state.decisions).toEqual([
    expect.objectContaining({ kind: "APPROVE", role: "VEHICLE_DEALER" }),
  ]);
  expect(state.effects).toEqual([
    expect.objectContaining({
      decisionKind: "APPROVE",
      resultApplicationState: "APPROVED",
      resultRoleState: "ACTIVE",
      role: "VEHICLE_DEALER",
    }),
  ]);
  expect(state.roles).toEqual([
    expect.objectContaining({ role: "VEHICLE_DEALER", state: "ACTIVE" }),
  ]);
  expect(state.roleEvents.map((event) => event.kind)).toEqual(
    expect.arrayContaining([
      "APPLICATION_SUBMITTED",
      "APPLICATION_CORRECTION_SUBMITTED",
      "ROLE_APPROVED",
    ])
  );
  expect(state.idempotency.map((record) => record.operation)).toEqual(
    expect.arrayContaining([
      "SAVE_DRAFT",
      "SUBMIT",
      "START_REVIEW",
      "REQUEST_CHANGES",
      "DECIDE_APPLICATION",
    ])
  );
  expect(state.audit.map((event) => event.kind)).toEqual(
    expect.arrayContaining([
      "MARKETPLACE_ROLE_APPLICATION_SUBMITTED",
      "MARKETPLACE_ROLE_APPLICATION_REVIEW_STARTED",
      "MARKETPLACE_ROLE_APPLICATION_REVIEWED",
      "MARKETPLACE_ROLE_DECISION_APPLIED",
    ])
  );
  expect(proFailures).toEqual([]);
  expect(opsFailures).toEqual([]);
  await adminContext.close();
  await reviewerContext.close();
});

test("Insurance Provider remains pending until a different reviewer confirms", async ({
  browser,
}) => {
  const adminContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.administrator
  );
  const proPage = await adminContext.newPage();
  const proFailures = watchBrowserFailures(proPage);
  await proPage.goto(
    `${proOrigin}/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/INSURANCE_PROVIDER`
  );
  const submission = await saveAndSubmitRole(
    proPage,
    "INSURANCE_PROVIDER",
    marketplaceRoleSubmissions.INSURANCE_PROVIDER
  );

  const proposerContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.reviewerOne
  );
  const proposerPage = await proposerContext.newPage();
  const proposerFailures = watchBrowserFailures(proposerPage);
  await proposerPage.goto(
    `${opsOrigin}/marketplace-role-cases/${submission.caseId}`
  );
  await startReview(proposerPage, submission.caseId);
  await setChecklist(proposerPage, marketplaceRoleChecklists.insurancePassed);
  const proposalResponse = await mutation(
    proposerPage,
    "POST",
    `/v1/operations/marketplace-role-cases/${submission.caseId}/decision`,
    async () => {
      await proposerPage.getByRole("button", { name: "Approve role" }).click();
    }
  );
  expect(proposalResponse.status()).toBe(200);
  const proposalEnvelope = await proposalResponse.json();
  expect(proposalEnvelope).toEqual({
    data: {
      applicationId: submission.applicationId,
      caseId: submission.caseId,
      decisionId: expect.any(String),
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "APPROVE",
      revisionId: submission.revisionId,
      role: "INSURANCE_PROVIDER",
    },
    ok: true,
    requestId: expect.any(String),
  });
  await persistLegacyPendingMarketplaceRoleCaseState(sql, submission.caseId);
  await proposerPage.reload();
  await expect(
    proposerPage.getByText("Pending Independent Review", { exact: true })
  ).toBeVisible();
  await expect(proposerPage.getByText(retiredApprovalLabel)).toHaveCount(0);
  await expect(
    proposerPage.getByText("Independent reviewer required", { exact: true })
  ).toBeVisible();
  await expect(
    proposerPage.getByRole("button", { name: "Confirm proposal" })
  ).toHaveCount(0);

  let state = await marketplaceRoleDatabaseState(sql);
  expect(
    state.roles.filter((role) => role.role === "INSURANCE_PROVIDER")
  ).toEqual([]);
  expect(
    state.effects.filter((effect) => effect.role === "INSURANCE_PROVIDER")
  ).toEqual([]);

  const beforeSameReviewer = await marketplaceRolePersistenceSnapshot(sql);
  const sameReviewer = await sessionHttp(proposerPage, {
    body: { decisionId: proposalEnvelope.data.decisionId, outcome: "CONFIRM" },
    idempotencyKey: `issue-46-insurance-self-confirm-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/operations/marketplace-role-cases/${submission.caseId}/independent-review`,
  });
  expect(sameReviewer).toMatchObject({
    body: {
      error: { code: "INDEPENDENT_REVIEWER_REQUIRED" },
      ok: false,
    },
    status: 422,
  });
  expect(await marketplaceRolePersistenceSnapshot(sql)).toEqual(
    beforeSameReviewer
  );

  const confirmerContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.reviewerTwo,
    { height: 1024, width: 768 }
  );
  const confirmerPage = await confirmerContext.newPage();
  const confirmerFailures = watchBrowserFailures(confirmerPage);
  await confirmerPage.goto(`${opsOrigin}/marketplace-role-cases`);
  await expect(
    confirmerPage.getByRole("heading", { name: "Marketplace Role cases" })
  ).toBeVisible();
  await expect(
    confirmerPage.getByText("Pending Independent Review", { exact: true })
  ).toBeVisible();
  await expect(confirmerPage.getByText(retiredApprovalLabel)).toHaveCount(0);
  await expectNoHorizontalOverflow(confirmerPage);
  await confirmerPage.goto(
    `${opsOrigin}/marketplace-role-cases/${submission.caseId}`
  );
  await expectNoHorizontalOverflow(confirmerPage);
  await expect(
    confirmerPage.getByRole("heading", {
      name: "Immutable Approve Decision Proposal",
    })
  ).toBeVisible();
  await expectEveryFormControlLabelled(confirmerPage);
  await expectVisibleFocus(
    confirmerPage.getByRole("button", { name: "Confirm proposal" })
  );
  const confirmResponse = await mutation(
    confirmerPage,
    "POST",
    `/v1/operations/marketplace-role-cases/${submission.caseId}/independent-review`,
    async () => {
      await confirmerPage
        .getByRole("button", { name: "Confirm proposal" })
        .click();
    }
  );
  expect(confirmResponse.status()).toBe(200);
  const confirmEnvelope = await confirmResponse.json();
  expect(confirmEnvelope).toEqual({
    data: {
      applicationId: submission.applicationId,
      caseId: submission.caseId,
      decisionId: proposalEnvelope.data.decisionId,
      kind: "APPLIED",
      reconsiderationUntil: null,
      revisionId: submission.revisionId,
      role: "INSURANCE_PROVIDER",
      roleId: expect.any(String),
      state: "ACTIVE",
    },
    ok: true,
    requestId: expect.any(String),
  });

  state = await marketplaceRoleDatabaseState(sql);
  expect(
    state.roles.find((role) => role.role === "INSURANCE_PROVIDER")
  ).toMatchObject({ state: "ACTIVE" });
  expect(
    state.reviews.find(
      (review) => review.decisionId === proposalEnvelope.data.decisionId
    )
  ).toEqual({
    decisionId: proposalEnvelope.data.decisionId,
    outcome: "CONFIRM",
    reviewerAccountId: marketplaceRoleActors.reviewerTwo.id,
  });
  expect(proFailures).toEqual([]);
  expect(proposerFailures).toEqual([]);
  expect(confirmerFailures).toEqual([]);
  await adminContext.close();
  await proposerContext.close();
  await confirmerContext.close();
});

async function saveAndSubmitThroughBrowserHttp(
  page: Page,
  role: MarketplaceRole,
  submission: MarketplaceRoleSubmission,
  keyPrefix: string,
  fixedNow?: string
) {
  const path = `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/${role}/application`;
  const saved = await browserHttp(page, {
    body: { submission },
    fixedNow,
    idempotencyKey: `${keyPrefix}-save`,
    method: "PUT",
    path,
  });
  expect(saved.status).toBe(200);
  const first = await browserHttp<{
    applicationId: string;
    caseId: string;
    revisionId: string;
    revisionNumber: number;
  }>(page, {
    fixedNow,
    idempotencyKey: `${keyPrefix}-submit`,
    method: "POST",
    path: `${path}/submit`,
  });
  expect(first.status).toBe(200);
  const beforeReplay = await marketplaceRolePersistenceSnapshot(sql);
  const replay = await browserHttp(page, {
    fixedNow,
    idempotencyKey: `${keyPrefix}-submit`,
    method: "POST",
    path: `${path}/submit`,
  });
  expect(replay.status).toBe(first.status);
  expect(replay.body).toEqual({
    ...first.body,
    requestId: expect.any(String),
  });
  expect(await marketplaceRolePersistenceSnapshot(sql)).toEqual(beforeReplay);
  return first.body.data as {
    applicationId: string;
    caseId: string;
    revisionId: string;
    revisionNumber: number;
  };
}

async function approveDirectThroughBrowserHttp(
  page: Page,
  role: Exclude<MarketplaceRole, "INSURANCE_PROVIDER">,
  caseId: string,
  keyPrefix: string,
  fixedNow?: string
) {
  const start = await browserHttp(page, {
    fixedNow,
    idempotencyKey: `${keyPrefix}-start`,
    method: "POST",
    path: `/v1/operations/marketplace-role-cases/${caseId}/start-review`,
  });
  expect(start.status).toBe(200);
  const checklist =
    role === "VEHICLE_DEALER"
      ? marketplaceRoleChecklists.vehiclePassed
      : ["approved-business-identity", "zra-status", "role-declarations"].map(
          (key) => ({
            checklistVersion:
              role === "PARTS_SELLER"
                ? "marketplace-role-parts-seller-v1"
                : "marketplace-role-accessories-seller-v1",
            key,
            state: "PASSED" as const,
          })
        );
  const request = {
    body: { checklist, decision: { decision: "APPROVE" } },
    fixedNow,
    idempotencyKey: `${keyPrefix}-decision`,
    method: "POST",
    path: `/v1/operations/marketplace-role-cases/${caseId}/decision`,
  } as const;
  const first = await browserHttp(page, request);
  expect(first.status).toBe(200);
  const beforeReplay = await marketplaceRolePersistenceSnapshot(sql);
  const replay = await browserHttp(page, request);
  expect(replay.status).toBe(first.status);
  expect(replay.body).toEqual({
    ...first.body,
    requestId: expect.any(String),
  });
  expect(await marketplaceRolePersistenceSnapshot(sql)).toEqual(beforeReplay);
  return first.body.data as { roleId: string; state: string };
}

async function ensureLifecyclePrerequisites(
  browser: Browser,
  administratorPage: Page
) {
  const portfolio = await browserHttp<
    { eligible: boolean; role: MarketplaceRole }[]
  >(administratorPage, {
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`,
  });
  expect(portfolio.status).toBe(200);
  const activeRoles = new Set(
    portfolio.body.data
      ?.filter((summary) => summary.eligible)
      .map((summary) => summary.role) ?? []
  );
  if (
    activeRoles.has("VEHICLE_DEALER") &&
    activeRoles.has("INSURANCE_PROVIDER")
  ) {
    return;
  }

  const reviewerContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.reviewerOne
  );
  const reviewerPage = await reviewerContext.newPage();
  const reviewerFailures = watchBrowserFailures(reviewerPage);
  await reviewerPage.goto(`${opsOrigin}/marketplace-role-cases`);
  await expect(
    reviewerPage.getByRole("heading", { name: "Marketplace Role cases" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(reviewerPage);

  if (!activeRoles.has("VEHICLE_DEALER")) {
    const vehicle = await saveAndSubmitThroughBrowserHttp(
      administratorPage,
      "VEHICLE_DEALER",
      marketplaceRoleSubmissions.VEHICLE_DEALER,
      `issue-46-lifecycle-vehicle-${marketplaceRoleFixture.runId}`
    );
    await approveDirectThroughBrowserHttp(
      reviewerPage,
      "VEHICLE_DEALER",
      vehicle.caseId,
      `issue-46-lifecycle-vehicle-${marketplaceRoleFixture.runId}`
    );
  }

  if (!activeRoles.has("INSURANCE_PROVIDER")) {
    const insurance = await saveAndSubmitThroughBrowserHttp(
      administratorPage,
      "INSURANCE_PROVIDER",
      marketplaceRoleSubmissions.INSURANCE_PROVIDER,
      `issue-46-lifecycle-insurance-${marketplaceRoleFixture.runId}`
    );
    const start = await browserHttp(reviewerPage, {
      idempotencyKey: `issue-46-lifecycle-insurance-start-${marketplaceRoleFixture.runId}`,
      method: "POST",
      path: `/v1/operations/marketplace-role-cases/${insurance.caseId}/start-review`,
    });
    expect(start.status).toBe(200);
    const proposal = await browserHttp<{ decisionId: string }>(reviewerPage, {
      body: {
        checklist: marketplaceRoleChecklists.insurancePassed,
        decision: { decision: "APPROVE" },
      },
      idempotencyKey: `issue-46-lifecycle-insurance-decision-${marketplaceRoleFixture.runId}`,
      method: "POST",
      path: `/v1/operations/marketplace-role-cases/${insurance.caseId}/decision`,
    });
    expect(proposal).toMatchObject({
      body: { data: { kind: "PENDING_INDEPENDENT_REVIEW" }, ok: true },
      status: 200,
    });

    const confirmerContext = await authenticatedContext(
      browser,
      marketplaceRoleActors.reviewerTwo,
      { height: 1024, width: 768 }
    );
    const confirmerPage = await confirmerContext.newPage();
    const confirmerFailures = watchBrowserFailures(confirmerPage);
    await confirmerPage.goto(`${opsOrigin}/marketplace-role-cases`);
    await expect(
      confirmerPage.getByRole("heading", { name: "Marketplace Role cases" })
    ).toBeVisible();
    await expectNoHorizontalOverflow(confirmerPage);
    const confirmation = await browserHttp(confirmerPage, {
      body: {
        decisionId: (proposal.body.data as { decisionId: string }).decisionId,
        outcome: "CONFIRM",
      },
      idempotencyKey: `issue-46-lifecycle-insurance-confirm-${marketplaceRoleFixture.runId}`,
      method: "POST",
      path: `/v1/operations/marketplace-role-cases/${insurance.caseId}/independent-review`,
    });
    expect(confirmation).toMatchObject({
      body: {
        data: { kind: "APPLIED", role: "INSURANCE_PROVIDER", state: "ACTIVE" },
        ok: true,
      },
      status: 200,
    });
    expect(confirmerFailures).toEqual([]);
    await confirmerContext.close();
  }

  expect(reviewerFailures).toEqual([]);
  await reviewerContext.close();
}

test("authorization, retries, controls, expiry, renewal, attestation, and relinquishment stay role isolated", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const narrowContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.narrowRepresentative,
    { height: 844, width: 390 }
  );
  const narrowPage = await narrowContext.newPage();
  const narrowFailures = watchBrowserFailures(narrowPage);
  await narrowPage.goto(
    `${proOrigin}/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`
  );
  await expect(
    narrowPage.getByText("Marketplace Role access is required", { exact: true })
  ).toBeVisible();
  await expectNoHorizontalOverflow(narrowPage);
  const narrowRead = await sessionHttp(narrowPage, {
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`,
  });
  expect(narrowRead).toMatchObject({
    body: { error: { code: "PERMISSION_DENIED" }, ok: false },
    status: 403,
  });
  const beforeNarrowDomain = await marketplaceRoleDomainSnapshot(sql);
  const beforeNarrowAudits = await marketplaceRoleAuditSnapshot(sql);
  const narrowDraft = await sessionHttp(narrowPage, {
    body: { submission: marketplaceRoleSubmissions.PARTS_SELLER },
    idempotencyKey: `issue-46-narrow-save-${marketplaceRoleFixture.runId}`,
    method: "PUT",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/PARTS_SELLER/application`,
  });
  const narrowSubmit = await sessionHttp(narrowPage, {
    idempotencyKey: `issue-46-narrow-submit-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/PARTS_SELLER/application/submit`,
  });
  for (const denial of [narrowDraft, narrowSubmit]) {
    expect(denial).toMatchObject({
      body: { error: { code: "PERMISSION_DENIED" }, ok: false },
      status: 403,
    });
  }
  expect(await marketplaceRoleDomainSnapshot(sql)).toEqual(beforeNarrowDomain);
  expectAccessDenialAudits(
    beforeNarrowAudits,
    await marketplaceRoleAuditSnapshot(sql),
    {
      accountId: marketplaceRoleActors.narrowRepresentative.id,
      code: "PERMISSION_DENIED",
      requestedBusinessId: marketplaceRoleFixture.business.id,
    }
  );

  const adminContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.administrator,
    { height: 844, width: 390 }
  );
  const adminPage = await adminContext.newPage();
  const adminFailures = watchBrowserFailures(adminPage);
  await adminPage.goto(
    `${proOrigin}/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`
  );
  await expectNoHorizontalOverflow(adminPage);
  await adminPage.goto(
    `${proOrigin}/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/PARTS_SELLER`
  );
  await expect(
    adminPage.getByRole("heading", { name: "Parts Seller application" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(adminPage);
  await expectEveryFormControlLabelled(adminPage);

  const crossBusinessRead = await sessionHttp(adminPage, {
    path: `/v1/businesses/${marketplaceRoleFixture.foreignBusiness.id}/marketplace-roles`,
  });
  expect(crossBusinessRead).toMatchObject({
    body: { error: { code: "BUSINESS_NOT_SELECTED" }, ok: false },
    status: 403,
  });
  const beforeCrossBusinessDomain =
    await marketplaceRoleScenarioDomainSnapshot(sql);
  const beforeCrossBusinessAudits = await marketplaceRoleAuditSnapshot(
    sql,
    marketplaceRoleFixture.foreignBusiness.id
  );
  const crossBusinessDraft = await sessionHttp(adminPage, {
    body: { submission: marketplaceRoleSubmissions.PARTS_SELLER },
    idempotencyKey: `issue-46-cross-business-save-${marketplaceRoleFixture.runId}`,
    method: "PUT",
    path: `/v1/businesses/${marketplaceRoleFixture.foreignBusiness.id}/marketplace-roles/PARTS_SELLER/application`,
  });
  const crossBusinessSubmit = await sessionHttp(adminPage, {
    idempotencyKey: `issue-46-cross-business-submit-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/businesses/${marketplaceRoleFixture.foreignBusiness.id}/marketplace-roles/PARTS_SELLER/application/submit`,
  });
  for (const denial of [crossBusinessDraft, crossBusinessSubmit]) {
    expect(denial).toMatchObject({
      body: { error: { code: "BUSINESS_NOT_SELECTED" }, ok: false },
      status: 403,
    });
  }
  expect(await marketplaceRoleScenarioDomainSnapshot(sql)).toEqual(
    beforeCrossBusinessDomain
  );
  expectAccessDenialAudits(
    beforeCrossBusinessAudits,
    await marketplaceRoleAuditSnapshot(
      sql,
      marketplaceRoleFixture.foreignBusiness.id
    ),
    {
      accountId: marketplaceRoleActors.administrator.id,
      code: "BUSINESS_NOT_SELECTED",
      requestedBusinessId: marketplaceRoleFixture.foreignBusiness.id,
    }
  );

  await ensureLifecyclePrerequisites(browser, adminPage);

  const parts = await saveAndSubmitThroughBrowserHttp(
    adminPage,
    "PARTS_SELLER",
    marketplaceRoleSubmissions.PARTS_SELLER,
    `issue-46-parts-${marketplaceRoleFixture.runId}`
  );
  const accessories = await saveAndSubmitThroughBrowserHttp(
    adminPage,
    "ACCESSORIES_SELLER",
    marketplaceRoleSubmissions.ACCESSORIES_SELLER,
    `issue-46-accessories-${marketplaceRoleFixture.runId}`
  );

  const reviewerContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.reviewerOne
  );
  const reviewerPage = await reviewerContext.newPage();
  const reviewerFailures = watchBrowserFailures(reviewerPage);
  await reviewerPage.goto(`${opsOrigin}/marketplace-role-cases`);
  await expect(
    reviewerPage.getByRole("heading", { name: "Marketplace Role cases" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(reviewerPage);
  const partsApproval = await approveDirectThroughBrowserHttp(
    reviewerPage,
    "PARTS_SELLER",
    parts.caseId,
    `issue-46-parts-${marketplaceRoleFixture.runId}`
  );
  await approveDirectThroughBrowserHttp(
    reviewerPage,
    "ACCESSORIES_SELLER",
    accessories.caseId,
    `issue-46-accessories-${marketplaceRoleFixture.runId}`
  );

  const beforeExpiryPortfolio = await browserHttp<PortfolioSummary[]>(
    adminPage,
    {
      fixedNow: marketplaceRoleBeforeExpiryClock,
      path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`,
    }
  );
  expect(beforeExpiryPortfolio.status).toBe(200);
  expect(beforeExpiryPortfolio.body.data).toHaveLength(4);
  const beforeExpirySummaries = beforeExpiryPortfolio.body.data ?? [];
  expect(
    beforeExpirySummaries.every(
      (summary) =>
        summary.nextAttestationAt !== null &&
        new Date(summary.nextAttestationAt).valueOf() >
          new Date(marketplaceRoleExpiredClock).valueOf()
    )
  ).toBe(true);
  expect(summaryFor(beforeExpirySummaries, "ACCESSORIES_SELLER")).toMatchObject(
    { eligible: true, evidenceStatus: "CURRENT" }
  );

  const expiredPortfolio = await browserHttp<PortfolioSummary[]>(adminPage, {
    fixedNow: marketplaceRoleExpiredClock,
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`,
  });
  expect(expiredPortfolio.status).toBe(200);
  const expiredSummaries = expiredPortfolio.body.data ?? [];
  expect(expiredSummaries).toHaveLength(beforeExpirySummaries.length);
  expect(
    expiredSummaries.filter((summary) => summary.role !== "ACCESSORIES_SELLER")
  ).toEqual(
    beforeExpirySummaries.filter(
      (summary) => summary.role !== "ACCESSORIES_SELLER"
    )
  );
  expect(summaryFor(expiredSummaries, "ACCESSORIES_SELLER")).toEqual({
    ...summaryFor(beforeExpirySummaries, "ACCESSORIES_SELLER"),
    eligible: false,
    evidenceStatus: "EXPIRED",
  });

  const renewal = await browserHttp(adminPage, {
    fixedNow: marketplaceRoleExpiredClock,
    idempotencyKey: `issue-46-accessories-renew-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/ACCESSORIES_SELLER/renewal`,
  });
  expect(renewal.status).toBe(200);
  const renewedAccessoriesSubmission: MarketplaceRoleSubmission = {
    ...marketplaceRoleSubmissions.ACCESSORIES_SELLER,
    evidence: marketplaceRoleSubmissions.ACCESSORIES_SELLER.evidence.map(
      (item) => ({ ...item, validUntil: "2035-07-15" })
    ),
  };
  const renewalDraft = await browserHttp(adminPage, {
    body: { submission: renewedAccessoriesSubmission },
    fixedNow: marketplaceRoleExpiredClock,
    idempotencyKey: `issue-46-accessories-renew-save-${marketplaceRoleFixture.runId}`,
    method: "PUT",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/ACCESSORIES_SELLER/application`,
  });
  expect(renewalDraft).toMatchObject({
    body: { data: { kind: "DRAFT_SAVED" }, ok: true },
    status: 200,
  });
  const renewalSubmission = await browserHttp<{
    caseId: string;
    revisionNumber: number;
  }>(adminPage, {
    fixedNow: marketplaceRoleExpiredClock,
    idempotencyKey: `issue-46-accessories-renew-submit-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/ACCESSORIES_SELLER/application/submit`,
  });
  expect(renewalSubmission).toMatchObject({
    body: { data: { revisionNumber: 2 }, ok: true },
    status: 200,
  });
  await approveDirectThroughBrowserHttp(
    reviewerPage,
    "ACCESSORIES_SELLER",
    renewalSubmission.body.data?.caseId as string,
    `issue-46-accessories-renew-${marketplaceRoleFixture.runId}`,
    marketplaceRoleExpiredClock
  );

  const renewedPortfolio = await browserHttp<PortfolioSummary[]>(adminPage, {
    fixedNow: marketplaceRoleExpiredClock,
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`,
  });
  expect(renewedPortfolio.status).toBe(200);
  const renewedSummaries = renewedPortfolio.body.data ?? [];
  expect(
    renewedSummaries.filter((summary) => summary.role !== "ACCESSORIES_SELLER")
  ).toEqual(
    expiredSummaries.filter((summary) => summary.role !== "ACCESSORIES_SELLER")
  );
  expect(summaryFor(renewedSummaries, "ACCESSORIES_SELLER")).toMatchObject({
    applicationState: "APPROVED",
    eligible: true,
    evidenceExpiresAt: expect.stringContaining("2035-07-15"),
    evidenceStatus: "CURRENT",
  });

  const beforeAttestation = await marketplaceRoleDomainSnapshot(sql);
  const beforeAttestedRole = canonicalRoleFor(
    beforeAttestation.roles,
    "PARTS_SELLER"
  );
  const attestation = await browserHttp(adminPage, {
    idempotencyKey: `issue-46-parts-attest-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/PARTS_SELLER/attestation`,
  });
  expect(attestation).toMatchObject({
    body: {
      data: { kind: "ATTESTED", roleId: partsApproval.roleId },
      ok: true,
    },
    status: 200,
  });
  const afterAttestation = await marketplaceRoleDomainSnapshot(sql);
  const afterAttestedRole = canonicalRoleFor(
    afterAttestation.roles,
    "PARTS_SELLER"
  );
  expect(
    afterAttestation.roles.filter((record) => record.role !== "PARTS_SELLER")
  ).toEqual(
    beforeAttestation.roles.filter((record) => record.role !== "PARTS_SELLER")
  );
  expect(afterAttestedRole).toEqual({
    ...beforeAttestedRole,
    nextAttestationAt: expect.any(String),
    updatedAt: expect.any(String),
  });
  expect(afterAttestedRole.nextAttestationAt).not.toBe(
    beforeAttestedRole.nextAttestationAt
  );
  expect(
    new Date(afterAttestedRole.nextAttestationAt as string).valueOf()
  ).toBeGreaterThan(
    new Date(beforeAttestedRole.nextAttestationAt as string).valueOf()
  );
  expect(afterAttestedRole.updatedAt).not.toBe(beforeAttestedRole.updatedAt);
  expect(
    new Date(afterAttestedRole.updatedAt as string).valueOf()
  ).toBeGreaterThan(new Date(beforeAttestedRole.updatedAt as string).valueOf());
  expect(afterAttestation.attestations).toEqual([
    ...beforeAttestation.attestations,
    {
      attestedAt: expect.any(String),
      attestedByAccountId: marketplaceRoleActors.administrator.id,
      businessId: marketplaceRoleFixture.business.id,
      id: expect.any(String),
      marketplaceRoleId: partsApproval.roleId,
      nextAttestationAt: afterAttestedRole.nextAttestationAt,
      role: "PARTS_SELLER",
      sequence: expect.any(Number),
    },
  ]);

  const controlProposal = await browserHttp<{
    caseId: string;
    decisionId: string;
    roleId: string;
  }>(reviewerPage, {
    body: {
      businessId: marketplaceRoleFixture.business.id,
      decision: {
        businessExplanation:
          "Vehicle Dealer activity is paused while current compliance is confirmed.",
        correctivePath: "Provide the current compliance confirmation.",
        decision: "SUSPEND",
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        internalNote: "Private suspension rationale.",
      },
      role: "VEHICLE_DEALER",
    },
    idempotencyKey: `issue-46-vehicle-suspend-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: "/v1/operations/marketplace-role-cases/eligibility-controls",
  });
  expect(controlProposal).toMatchObject({
    body: {
      data: {
        kind: "PENDING_INDEPENDENT_REVIEW",
        proposedDecision: "SUSPEND",
        role: "VEHICLE_DEALER",
      },
      ok: true,
    },
    status: 200,
  });
  let state = await marketplaceRoleDatabaseState(sql);
  expect(
    state.roles.find((role) => role.role === "VEHICLE_DEALER")
  ).toMatchObject({
    state: "ACTIVE",
  });

  const secondReviewerContext = await authenticatedContext(
    browser,
    marketplaceRoleActors.reviewerTwo
  );
  const secondReviewerPage = await secondReviewerContext.newPage();
  const secondReviewerFailures = watchBrowserFailures(secondReviewerPage);
  await secondReviewerPage.goto(`${opsOrigin}/marketplace-role-cases`);
  await expect(
    secondReviewerPage.getByRole("heading", {
      name: "Marketplace Role cases",
    })
  ).toBeVisible();
  await expectNoHorizontalOverflow(secondReviewerPage);
  const controlConfirm = await browserHttp(secondReviewerPage, {
    body: {
      decisionId: (controlProposal.body.data as { decisionId: string })
        .decisionId,
      outcome: "CONFIRM",
    },
    idempotencyKey: `issue-46-vehicle-suspend-confirm-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/operations/marketplace-role-cases/${controlProposal.body.data?.caseId}/independent-review`,
  });
  expect(controlConfirm).toMatchObject({
    body: {
      data: { kind: "APPLIED", role: "VEHICLE_DEALER", state: "SUSPENDED" },
      ok: true,
    },
    status: 200,
  });

  const relinquishment = await browserHttp(adminPage, {
    idempotencyKey: `issue-46-insurance-relinquish-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/INSURANCE_PROVIDER/relinquish`,
  });
  expect(relinquishment).toMatchObject({
    body: { data: { kind: "RELINQUISHED", state: "RELINQUISHED" }, ok: true },
    status: 200,
  });

  state = await marketplaceRoleDatabaseState(sql);
  expect(
    Object.fromEntries(state.roles.map((role) => [role.role, role.state]))
  ).toEqual({
    ACCESSORIES_SELLER: "ACTIVE",
    INSURANCE_PROVIDER: "RELINQUISHED",
    PARTS_SELLER: "ACTIVE",
    VEHICLE_DEALER: "SUSPENDED",
  });
  expect(state.attestations).toEqual([
    expect.objectContaining({
      attestedByAccountId: marketplaceRoleActors.administrator.id,
      role: "PARTS_SELLER",
    }),
  ]);
  expect(
    state.applications.find(
      (application) => application.role === "ACCESSORIES_SELLER"
    )
  ).toMatchObject({ latestRevisionNumber: 2, state: "APPROVED" });
  expect(
    state.cases.filter(
      (record) =>
        record.role === "ACCESSORIES_SELLER" &&
        record.subjectType === "MARKETPLACE_ROLE_APPLICATION"
    )
  ).toHaveLength(2);
  expect(
    state.idempotency.filter(
      (record) =>
        record.role === "PARTS_SELLER" && record.operation === "SUBMIT"
    )
  ).toHaveLength(1);
  expect(
    state.idempotency.filter(
      (record) =>
        record.role === "PARTS_SELLER" &&
        record.operation === "DECIDE_APPLICATION"
    )
  ).toHaveLength(1);
  expect(
    state.decisions.filter((decision) => decision.kind === "SUSPEND")
  ).toHaveLength(1);
  expect(
    state.effects.filter((effect) => effect.decisionKind === "SUSPEND")
  ).toHaveLength(1);

  await adminPage.goto(
    `${proOrigin}/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/INSURANCE_PROVIDER`
  );
  await expect(
    adminPage.getByRole("button", { name: "Relinquish" })
  ).toHaveCount(0);
  await expect(
    adminPage.getByRole("heading", {
      name: "Start a fresh Insurance Provider application",
    })
  ).toBeVisible();
  await expect(
    adminPage.getByRole("button", { name: "Submit fresh application" })
  ).toBeVisible();
  await expect(
    adminPage.getByText("Lifecycle 1", { exact: true })
  ).toBeVisible();
  await expectNoHorizontalOverflow(adminPage);

  const formerInsuranceApplication = state.applications.find(
    (application) => application.role === "INSURANCE_PROVIDER"
  );
  const formerInsuranceRole = state.roles.find(
    (record) => record.role === "INSURANCE_PROVIDER"
  );
  if (!(formerInsuranceApplication && formerInsuranceRole)) {
    throw new Error("Expected the relinquished Insurance Provider lifecycle.");
  }
  expect(formerInsuranceApplication).toMatchObject({
    lifecycleNumber: 1,
    previousApplicationId: null,
    state: "APPROVED",
  });
  expect(formerInsuranceRole).toMatchObject({
    applicationId: formerInsuranceApplication.id,
    state: "RELINQUISHED",
  });

  const beforeReapplication = await marketplaceRoleDomainSnapshot(sql);
  const beforeReapplicationPortfolio = await browserHttp<PortfolioSummary[]>(
    adminPage,
    {
      path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`,
    }
  );
  expect(beforeReapplicationPortfolio.status).toBe(200);
  expect(
    summaryFor(
      beforeReapplicationPortfolio.body.data ?? [],
      "INSURANCE_PROVIDER"
    )
  ).toMatchObject({
    applicationState: "APPROVED",
    continuingState: "RELINQUISHED",
    eligible: false,
    lifecycleNumber: 1,
    priorLifecycleCount: 0,
  });

  const beforeRenewalDenial = await marketplaceRoleDomainSnapshot(sql);
  const relinquishedRenewal = await sessionHttp(adminPage, {
    idempotencyKey: `issue-81-insurance-renew-denied-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/INSURANCE_PROVIDER/renewal`,
  });
  expect(relinquishedRenewal).toMatchObject({
    body: { error: { code: "ROLE_RELINQUISHED" }, ok: false },
    status: 422,
  });
  expect(await marketplaceRoleDomainSnapshot(sql)).toEqual(beforeRenewalDenial);

  const beforeRestoreDenial = await marketplaceRoleDomainSnapshot(sql);
  const relinquishedRestore = await sessionHttp(reviewerPage, {
    body: {
      businessId: marketplaceRoleFixture.business.id,
      decision: {
        businessExplanation: "A relinquished role cannot be restored.",
        correctivePath: "Start a fresh application instead.",
        decision: "RESTORE",
        effectiveAt: new Date().toISOString(),
      },
      role: "INSURANCE_PROVIDER",
    },
    idempotencyKey: `issue-81-insurance-restore-denied-${marketplaceRoleFixture.runId}`,
    method: "POST",
    path: "/v1/operations/marketplace-role-cases/eligibility-controls",
  });
  expect(relinquishedRestore).toMatchObject({
    body: { error: { code: "ROLE_RELINQUISHED" }, ok: false },
    status: 422,
  });
  expect(await marketplaceRoleDomainSnapshot(sql)).toEqual(beforeRestoreDenial);

  const freshSubmission = await saveAndSubmitRole(
    adminPage,
    "INSURANCE_PROVIDER",
    marketplaceRoleSubmissions.INSURANCE_PROVIDER
  );
  expect(freshSubmission.applicationId).not.toBe(formerInsuranceApplication.id);
  await expect(
    adminPage.getByRole("heading", {
      name: "Fresh Insurance Provider application",
    })
  ).toBeVisible();
  await expect(
    adminPage.getByText("Lifecycle 2", { exact: true })
  ).toBeVisible();
  await expectNoHorizontalOverflow(adminPage);

  await reviewerPage.goto(
    `${opsOrigin}/marketplace-role-cases/${freshSubmission.caseId}`
  );
  await expect(
    reviewerPage.getByText("Lifecycle 2", { exact: true })
  ).toBeVisible();
  await startReview(reviewerPage, freshSubmission.caseId);
  await setChecklist(reviewerPage, marketplaceRoleChecklists.insurancePassed);
  const freshProposalResponse = await mutation(
    reviewerPage,
    "POST",
    `/v1/operations/marketplace-role-cases/${freshSubmission.caseId}/decision`,
    async () => {
      await reviewerPage.getByRole("button", { name: "Approve role" }).click();
    }
  );
  expect(freshProposalResponse.status()).toBe(200);
  const freshProposalEnvelope = await freshProposalResponse.json();
  expect(freshProposalEnvelope).toEqual({
    data: {
      applicationId: freshSubmission.applicationId,
      caseId: freshSubmission.caseId,
      decisionId: expect.any(String),
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "APPROVE",
      revisionId: freshSubmission.revisionId,
      role: "INSURANCE_PROVIDER",
    },
    ok: true,
    requestId: expect.any(String),
  });

  await secondReviewerPage.goto(
    `${opsOrigin}/marketplace-role-cases/${freshSubmission.caseId}`
  );
  await expect(
    secondReviewerPage.getByText("Lifecycle 2", { exact: true })
  ).toBeVisible();
  await expect(
    secondReviewerPage.getByText("Lifecycle 1", { exact: true })
  ).toBeVisible();
  await expectNoHorizontalOverflow(secondReviewerPage);
  const freshConfirmationResponse = await mutation(
    secondReviewerPage,
    "POST",
    `/v1/operations/marketplace-role-cases/${freshSubmission.caseId}/independent-review`,
    async () => {
      await secondReviewerPage
        .getByRole("button", { name: "Confirm proposal" })
        .click();
    }
  );
  expect(freshConfirmationResponse.status()).toBe(200);
  const freshConfirmationEnvelope = await freshConfirmationResponse.json();
  expect(freshConfirmationEnvelope).toEqual({
    data: {
      applicationId: freshSubmission.applicationId,
      caseId: freshSubmission.caseId,
      decisionId: freshProposalEnvelope.data.decisionId,
      kind: "APPLIED",
      reconsiderationUntil: null,
      revisionId: freshSubmission.revisionId,
      role: "INSURANCE_PROVIDER",
      roleId: expect.any(String),
      state: "ACTIVE",
    },
    ok: true,
    requestId: expect.any(String),
  });

  await adminPage.goto(
    `${proOrigin}/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles/INSURANCE_PROVIDER`
  );
  await expect(
    adminPage.getByRole("heading", { name: "Application lifecycle history" })
  ).toBeVisible();
  await expect(
    adminPage.getByText("Lifecycle 2", { exact: true })
  ).toBeVisible();
  await expect(
    adminPage.getByText("Lifecycle 1", { exact: true })
  ).toBeVisible();
  await expect(
    adminPage.getByText(freshSubmission.applicationId, { exact: true })
  ).toBeVisible();
  await expect(
    adminPage.getByText(formerInsuranceApplication.id, { exact: true })
  ).toHaveCount(2);
  await expectNoHorizontalOverflow(adminPage);

  const afterReapplication = await marketplaceRoleDomainSnapshot(sql);
  const formerApplicationSnapshot = beforeReapplication.applications.find(
    (application) => application.id === formerInsuranceApplication.id
  );
  const formerRoleSnapshot = beforeReapplication.roles.find(
    (record) => record.id === formerInsuranceRole.id
  );
  if (!(formerApplicationSnapshot && formerRoleSnapshot)) {
    throw new Error("Expected immutable former lifecycle snapshots.");
  }
  expect(
    afterReapplication.applications.find(
      (application) => application.id === formerInsuranceApplication.id
    )
  ).toEqual(formerApplicationSnapshot);
  expect(
    afterReapplication.roles.find(
      (record) => record.id === formerInsuranceRole.id
    )
  ).toEqual(formerRoleSnapshot);
  expect(
    afterReapplication.applications.filter(
      (application) => application.role !== "INSURANCE_PROVIDER"
    )
  ).toEqual(
    beforeReapplication.applications.filter(
      (application) => application.role !== "INSURANCE_PROVIDER"
    )
  );
  expect(
    afterReapplication.roles.filter(
      (record) => record.role !== "INSURANCE_PROVIDER"
    )
  ).toEqual(
    beforeReapplication.roles.filter(
      (record) => record.role !== "INSURANCE_PROVIDER"
    )
  );

  state = await marketplaceRoleDatabaseState(sql);
  expect(
    state.applications.filter(
      (application) => application.role === "INSURANCE_PROVIDER"
    )
  ).toEqual([
    expect.objectContaining({
      id: formerInsuranceApplication.id,
      lifecycleNumber: 1,
      previousApplicationId: null,
      state: "APPROVED",
    }),
    expect.objectContaining({
      id: freshSubmission.applicationId,
      lifecycleNumber: 2,
      previousApplicationId: formerInsuranceApplication.id,
      state: "APPROVED",
    }),
  ]);
  const insuranceRoles = state.roles.filter(
    (record) => record.role === "INSURANCE_PROVIDER"
  );
  expect(insuranceRoles).toHaveLength(2);
  expect(insuranceRoles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        applicationId: formerInsuranceApplication.id,
        id: formerInsuranceRole.id,
        state: "RELINQUISHED",
      }),
      expect.objectContaining({
        applicationId: freshSubmission.applicationId,
        id: freshConfirmationEnvelope.data.roleId,
        state: "ACTIVE",
      }),
    ])
  );
  expect(
    state.cases
      .filter(
        (record) =>
          record.role === "INSURANCE_PROVIDER" &&
          record.subjectType === "MARKETPLACE_ROLE_APPLICATION"
      )
      .map((record) => record.marketplaceRoleApplicationId)
  ).toEqual([formerInsuranceApplication.id, freshSubmission.applicationId]);
  expect(
    state.decisions
      .filter(
        (decision) =>
          decision.role === "INSURANCE_PROVIDER" && decision.kind === "APPROVE"
      )
      .map((decision) => decision.marketplaceRoleApplicationId)
  ).toEqual([formerInsuranceApplication.id, freshSubmission.applicationId]);
  const auditedApplicationIds = new Set(
    state.audit
      .map((event) => event.marketplaceRoleApplicationId)
      .filter((applicationId): applicationId is string =>
        Boolean(applicationId)
      )
  );
  expect(auditedApplicationIds.has(formerInsuranceApplication.id)).toBe(true);
  expect(auditedApplicationIds.has(freshSubmission.applicationId)).toBe(true);

  const afterReapplicationPortfolio = await browserHttp<PortfolioSummary[]>(
    adminPage,
    {
      path: `/v1/businesses/${marketplaceRoleFixture.business.id}/marketplace-roles`,
    }
  );
  expect(afterReapplicationPortfolio.status).toBe(200);
  const afterReapplicationSummaries =
    afterReapplicationPortfolio.body.data ?? [];
  expect(
    afterReapplicationSummaries.filter(
      (summary) => summary.role !== "INSURANCE_PROVIDER"
    )
  ).toEqual(
    (beforeReapplicationPortfolio.body.data ?? []).filter(
      (summary) => summary.role !== "INSURANCE_PROVIDER"
    )
  );
  expect(
    summaryFor(afterReapplicationSummaries, "INSURANCE_PROVIDER")
  ).toMatchObject({
    applicationState: "APPROVED",
    continuingState: "ACTIVE",
    eligible: true,
    lifecycleNumber: 2,
    priorLifecycleCount: 1,
  });

  expect(narrowFailures).toEqual([]);
  expect(adminFailures).toEqual([]);
  expect(reviewerFailures).toEqual([]);
  expect(secondReviewerFailures).toEqual([]);
  await narrowContext.close();
  await adminContext.close();
  await reviewerContext.close();
  await secondReviewerContext.close();
});
