import {
  type APIResponse,
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from "@playwright/test";
import {
  correctedPacraDescription,
  correctionMessage,
  issue44Fixture,
  mandatoryChecklistKeys,
  secondCorrectionMessage,
} from "./fixtures/business-authority.ts";
import {
  betterAuthSessionCookieName,
  signBetterAuthSessionToken,
} from "./helpers/auth-session.ts";
import {
  approvedDatabaseState,
  approvedProjection,
  caseIdForApplicant,
  cleanupBusinessAuthorityScenario,
  openE2eDatabase,
  seedAuthenticatedActors,
  seedMembershipWithoutAuthority,
} from "./helpers/business-authority-database.ts";
import { apiOrigin, opsOrigin, proOrigin } from "./helpers/origins.ts";

const secret =
  process.env.BETTER_AUTH_SECRET ??
  "issue-44-e2e-secret-that-is-at-least-32-characters";
const accessTimestampPattern = /Authorized access checked at .* CAT\./;
const anyId = () => expect.any(String);

interface Actor {
  readonly token: string;
}

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
    const expectedExceptionResponse =
      message.text() ===
      "Failed to load resource: the server responded with a status of 409 (Conflict)";
    if (message.type() === "error" && !expectedExceptionResponse) {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "";
    if (errorText === "net::ERR_ABORTED") {
      return;
    }
    failures.push(
      `requestfailed: ${request.method()} ${request.url()} ${errorText}`
    );
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

async function expectEveryControlLabelled(page: Page) {
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
        .map((control) => (control as HTMLInputElement).id || control.outerHTML)
    );
  expect(unlabelled).toEqual([]);
}

async function expectEveryRoleControlNamed(page: Page) {
  const unnamed = await page
    .locator("button, [role=button], [role=radio]")
    .evaluateAll((controls) =>
      controls
        .filter((control) => {
          const labelledBy = control
            .getAttribute("aria-labelledby")
            ?.split(" ")
            .filter(Boolean)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .join(" ")
            .trim();
          const explicitLabel = control.id
            ? document
                .querySelector(`label[for="${CSS.escape(control.id)}"]`)
                ?.textContent?.trim()
            : "";
          return !(
            control.getAttribute("aria-label")?.trim() ||
            labelledBy ||
            explicitLabel ||
            control.textContent?.trim() ||
            control.getAttribute("title")?.trim()
          );
        })
        .map((control) => control.outerHTML)
    );
  expect(unnamed).toEqual([]);
}

async function expectVisibleFocusIndicator(control: Locator) {
  await expect(control).toBeFocused();
  const focusedStyle = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  await control.evaluate((element) => (element as HTMLElement).blur());
  await expect(control).not.toBeFocused();
  await control.page().waitForTimeout(200);
  const unfocusedStyle = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  const focusedOutlineIsVisible =
    focusedStyle.outlineStyle !== "none" &&
    Number.parseFloat(focusedStyle.outlineWidth) > 0;
  const outlineChanged =
    focusedOutlineIsVisible &&
    (focusedStyle.outlineColor !== unfocusedStyle.outlineColor ||
      focusedStyle.outlineStyle !== unfocusedStyle.outlineStyle ||
      focusedStyle.outlineWidth !== unfocusedStyle.outlineWidth);
  const ringChanged =
    focusedStyle.boxShadow !== "none" &&
    focusedStyle.boxShadow !== unfocusedStyle.boxShadow;
  expect({ outlineChanged, ringChanged }).not.toEqual({
    outlineChanged: false,
    ringChanged: false,
  });
  await control.focus();
}

async function expectBelowStickyHeader(page: Page, element: Locator) {
  const header = page.locator("header").first();
  const [headerBox, elementBox] = await Promise.all([
    header.boundingBox(),
    element.boundingBox(),
  ]);
  expect(headerBox).not.toBeNull();
  expect(elementBox).not.toBeNull();
  expect(elementBox?.y).toBeGreaterThanOrEqual(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0)
  );
}

async function mutation(
  page: Page,
  method: string,
  path: string,
  expectedData: Record<string, unknown>,
  action: () => Promise<void>
) {
  const responsePromise = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === method &&
      new URL(candidate.url()).pathname === path
  );
  await action();
  const mutationResponse = await responsePromise;
  await expectSuccessfulEnvelope(mutationResponse, expectedData);
  return mutationResponse;
}

async function expectSuccessfulEnvelope(
  response: APIResponse | Response,
  expectedData: Record<string, unknown>
) {
  expect(response.status()).toBe(200);
  const envelope = await response.json();
  expect(envelope).toEqual({
    data: expectedData,
    ok: true,
    requestId: expect.any(String),
  });
  return envelope;
}

function expectedDraftSaved(
  state: "CHANGES_REQUESTED" | "DRAFT",
  applicationId: unknown = anyId()
) {
  return { applicationId, kind: "DRAFT_SAVED", state };
}

function expectedSubmitted(
  revisionNumber: number,
  applicationId: unknown = anyId(),
  caseId: unknown = anyId()
) {
  return {
    applicationId,
    caseId,
    kind: "SUBMITTED",
    revisionId: anyId(),
    revisionNumber,
    state: "SUBMITTED",
  };
}

function expectedReviewStarted(
  caseId: string,
  applicationId: unknown = anyId()
) {
  return { applicationId, caseId, kind: "REVIEW_STARTED" };
}

function expectedChangesRequested(
  caseId: string,
  applicationId: unknown = anyId()
) {
  return { applicationId, caseId, kind: "CHANGES_REQUESTED" };
}

function expectedSessionSelection(applicantOrganizationId: string | null) {
  return [
    {
      activeOrganizationId: applicantOrganizationId,
      userId: issue44Fixture.applicant.id,
    },
    {
      activeOrganizationId: null,
      userId: issue44Fixture.duplicateApplicant.id,
    },
    {
      activeOrganizationId: null,
      userId: issue44Fixture.foreignApplicant.id,
    },
    {
      activeOrganizationId: null,
      userId: issue44Fixture.membershipOnlyUser.id,
    },
    {
      activeOrganizationId: null,
      userId: issue44Fixture.reviewer.id,
    },
  ];
}

function submissionForForeignBusiness() {
  const { submission } = issue44Fixture;
  return {
    applicant: {
      displayName: issue44Fixture.foreignApplicant.name,
      position: "Director",
    },
    authority: {
      basis: "DIRECTOR",
      evidenceIds: ["evidence://issue-44/foreign-authority"],
    },
    contact: {
      email: "marketplace@mambilima.example",
      phone: "+260972345678",
    },
    declarations: {
      authorityConfirmed: true,
      informationAccurate: true,
      privacyAcknowledged: true,
    },
    evidence: [
      {
        id: "evidence://issue-44/foreign-authority",
        kind: "AUTHORITY_EVIDENCE",
        name: "Foreign Business board resolution",
      },
      {
        id: "evidence://issue-44/foreign-pacra",
        kind: "PACRA_PRINT_OUT",
        name: "Foreign Business PACRA printout",
      },
    ],
    identity: {
      country: "ZM",
      entityType: submission.entityType,
      pacraRegistrationNumber: "120260045",
      registeredName: "Mambilima Motors Limited",
      tradingName: "Mambilima Motors",
    },
    location: {
      addressLine1: "25 Independence Avenue",
      city: "Ndola",
      country: "ZM",
      province: "Copperbelt",
    },
    registrationDate: "2023-05-11",
    verifiedPhoneReference: "phone-verification://issue-44/foreign",
  };
}

async function fillApplication(page: Page) {
  const { submission } = issue44Fixture;
  await page.getByLabel("Registered name").fill(submission.registeredName);
  await page.getByLabel("Trading name (optional)").fill(submission.tradingName);
  await page.getByLabel("Entity type").selectOption(submission.entityType);
  await page
    .getByLabel("PACRA registration number")
    .fill(submission.pacraRegistrationNumber);
  await page.getByLabel("Registration date").fill(submission.registrationDate);
  await page.getByLabel("Email address").fill(submission.contactEmail);
  await page.getByLabel("Zambian mobile number").fill(submission.contactPhone);
  await page
    .getByLabel("Verified phone reference")
    .fill(submission.verifiedPhoneReference);
  await page.getByLabel("Address", { exact: true }).fill(submission.address);
  await page.getByLabel("City or town").fill(submission.city);
  await page.getByLabel("Province").selectOption(submission.province);
  await page.getByLabel("Your full name").fill(issue44Fixture.applicant.name);
  await page.getByLabel("Position").fill(submission.applicantPosition);
  await page
    .getByLabel("Authority basis")
    .selectOption(submission.authorityBasis);
  await page
    .getByLabel("Authority evidence reference")
    .fill(submission.authorityEvidenceReference);
  await page
    .getByLabel("Authority evidence description")
    .fill(submission.authorityEvidenceDescription);
  await page
    .getByLabel("PACRA document reference")
    .fill(submission.pacraEvidenceReference);
  await page
    .getByLabel("PACRA document description")
    .fill(submission.pacraEvidenceDescription);
  await page
    .getByLabel("I confirm I have authority to act for this Business.")
    .check();
  await page
    .getByLabel("I confirm the information is accurate and complete.")
    .check();
  await page
    .getByLabel(
      "I acknowledge that Marliket will process this information according to its privacy notice."
    )
    .check();
}

test("initial Business authority journey preserves review evidence and enforces access", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sql = await openE2eDatabase({
    requiredDatabasePrefix: "marliket_issue44_e2e_",
  });
  const browserFailureGroups: string[][] = [];

  try {
    await cleanupBusinessAuthorityScenario(sql);
    await seedAuthenticatedActors(sql);

    const applicantContext = await authenticatedContext(
      browser,
      issue44Fixture.applicant
    );
    const applicant = await applicantContext.newPage();
    browserFailureGroups.push(watchBrowserFailures(applicant));

    await applicant.goto(`${proOrigin}/business-application`);
    await expect(applicant.getByRole("heading", { level: 1 })).toContainText(
      "Business"
    );
    await expectNoHorizontalOverflow(applicant);
    await expectEveryControlLabelled(applicant);

    await applicant.setViewportSize({ height: 844, width: 390 });
    await expectNoHorizontalOverflow(applicant);
    await applicant.getByRole("button", { name: "Submit for review" }).click();
    const errorSummary = applicant.getByRole("alert").filter({
      has: applicant.getByRole("heading", {
        name: "Check the highlighted fields",
      }),
    });
    await expect(errorSummary).toBeVisible();
    await expectVisibleFocusIndicator(errorSummary);
    await expectBelowStickyHeader(
      applicant,
      errorSummary.getByRole("heading", {
        name: "Check the highlighted fields",
      })
    );
    await expectNoHorizontalOverflow(applicant);
    const firstErrorLink = errorSummary.getByRole("link").first();
    await expect(firstErrorLink).toHaveText(
      "Registered name: Enter the registered Business name."
    );
    await applicant.keyboard.press("Tab");
    await expectVisibleFocusIndicator(firstErrorLink);
    await applicant.keyboard.press("Enter");
    await expect(applicant.getByLabel("Registered name")).toBeFocused();
    await applicant.setViewportSize({ height: 1000, width: 1440 });

    await fillApplication(applicant);
    await expectEveryRoleControlNamed(applicant);
    const privacyAcknowledgement = applicant.getByLabel(
      "I acknowledge that Marliket will process this information according to its privacy notice."
    );
    const saveDraftButton = applicant.getByRole("button", {
      name: "Save draft",
    });
    const submitButton = applicant.getByRole("button", {
      name: "Submit for review",
    });
    await privacyAcknowledgement.focus();
    await applicant.keyboard.press("Tab");
    await expectVisibleFocusIndicator(saveDraftButton);
    await applicant.keyboard.press("Tab");
    await expectVisibleFocusIndicator(submitButton);
    await applicant.keyboard.press("Shift+Tab");
    await expectVisibleFocusIndicator(saveDraftButton);
    await mutation(
      applicant,
      "PUT",
      "/v1/business-applications/current",
      expectedDraftSaved("DRAFT"),
      () => saveDraftButton.click()
    );
    await expect(
      applicant.getByRole("paragraph").filter({ hasText: "Draft saved." })
    ).toBeVisible();

    const submitResponse = applicant.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/v1/business-applications/current/submit"
    );
    const saveBeforeSubmit = applicant.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === "/v1/business-applications/current"
    );
    await applicant.getByRole("button", { name: "Submit for review" }).click();
    const firstSaveEnvelope = await expectSuccessfulEnvelope(
      await saveBeforeSubmit,
      expectedDraftSaved("DRAFT")
    );
    await expectSuccessfulEnvelope(
      await submitResponse,
      expectedSubmitted(1, firstSaveEnvelope.data.applicationId)
    );
    await expect(
      applicant.getByText("Application submitted", { exact: true })
    ).toBeVisible();

    const caseId = await caseIdForApplicant(sql);
    const reviewerContext = await authenticatedContext(
      browser,
      issue44Fixture.reviewer
    );
    const reviewer = await reviewerContext.newPage();
    browserFailureGroups.push(watchBrowserFailures(reviewer));
    await reviewer.goto(`${opsOrigin}/business-authority-cases`);
    await expectNoHorizontalOverflow(reviewer);
    await reviewer.getByRole("link", { name: "Review case" }).click();
    await expect(reviewer).toHaveURL(
      `${opsOrigin}/business-authority-cases/${caseId}`
    );
    await expect(
      reviewer.getByText("Revision 1 - immutable submission (current)")
    ).toBeVisible();
    await mutation(
      reviewer,
      "POST",
      `/v1/operations/business-authority-cases/${caseId}/start-review`,
      expectedReviewStarted(caseId),
      () => reviewer.getByRole("button", { name: "Start review" }).click()
    );
    await expect(
      reviewer.getByRole("heading", { name: "Review checklist" })
    ).toBeVisible();
    await expectEveryControlLabelled(reviewer);
    await expectEveryRoleControlNamed(reviewer);

    const firstChecklistGroup = reviewer.locator("fieldset").filter({
      has: reviewer.locator("#registered-identity-PASSED"),
    });
    const firstSelectedRadio = firstChecklistGroup.getByRole("radio", {
      name: "Unresolved",
    });
    await firstSelectedRadio.focus();
    await reviewer.keyboard.press("Shift+Tab");
    await reviewer.keyboard.press("Tab");
    await expectVisibleFocusIndicator(firstSelectedRadio);
    for (const key of mandatoryChecklistKeys) {
      // biome-ignore lint/performance/noAwaitInLoops: Radix radio updates race when clicked concurrently.
      await reviewer
        .locator("fieldset")
        .filter({ has: reviewer.locator(`#${key}-PASSED`) })
        .getByRole("radio", { name: "Passed" })
        .check();
    }
    await reviewer
      .locator("fieldset")
      .filter({ has: reviewer.locator("#pacra-status-FAILED") })
      .getByRole("radio", { name: "Failed" })
      .check();
    const correctionInput = reviewer.getByLabel(
      "Consolidated correction message"
    );
    await correctionInput.fill(correctionMessage);
    await reviewer.setViewportSize({ height: 1024, width: 768 });
    await expectNoHorizontalOverflow(reviewer);
    const requestChangesButton = reviewer.getByRole("button", {
      name: "Request changes",
    });
    await expect(requestChangesButton).toBeVisible();
    await correctionInput.focus();
    await reviewer.keyboard.press("Tab");
    await expectVisibleFocusIndicator(requestChangesButton);
    await reviewer.keyboard.press("Shift+Tab");
    await expectVisibleFocusIndicator(correctionInput);
    await mutation(
      reviewer,
      "POST",
      `/v1/operations/business-authority-cases/${caseId}/request-changes`,
      expectedChangesRequested(caseId),
      () => requestChangesButton.click()
    );
    await expect(reviewer.getByText("CHANGES REQUESTED")).toBeVisible();

    await applicant.goto(`${proOrigin}/business-application`);
    await expect(
      applicant.getByText("Consolidated correction notice", { exact: true })
    ).toBeVisible();
    await expect(applicant.getByText(correctionMessage)).toBeVisible();
    await applicant
      .getByLabel("PACRA document description")
      .fill(correctedPacraDescription);
    const secondSubmit = applicant.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/v1/business-applications/current/submit"
    );
    const secondSave = applicant.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === "/v1/business-applications/current"
    );
    await applicant.getByRole("button", { name: "Submit for review" }).click();
    const secondSaveEnvelope = await expectSuccessfulEnvelope(
      await secondSave,
      expectedDraftSaved("CHANGES_REQUESTED")
    );
    await expectSuccessfulEnvelope(
      await secondSubmit,
      expectedSubmitted(2, secondSaveEnvelope.data.applicationId, caseId)
    );

    await reviewer.setViewportSize({ height: 1000, width: 1440 });
    await reviewer.goto(`${opsOrigin}/business-authority-cases/${caseId}`);
    await expect(
      reviewer.getByText("Revision 2 - immutable submission (current)")
    ).toBeVisible();
    await expect(
      reviewer.getByText("Revision 1 - immutable submission")
    ).toBeVisible();
    await reviewer
      .getByText("Revision 1 - immutable submission", { exact: true })
      .click();
    await expect(
      reviewer.getByText("PACRA company printout", { exact: true })
    ).toBeVisible();
    await expect(reviewer.getByText("FAILED", { exact: true })).toBeVisible();
    await expect(reviewer.getByText("APPLICATION RESUBMITTED")).toBeVisible();
    await mutation(
      reviewer,
      "POST",
      `/v1/operations/business-authority-cases/${caseId}/start-review`,
      expectedReviewStarted(caseId),
      () => reviewer.getByRole("button", { name: "Start review" }).click()
    );

    for (const key of mandatoryChecklistKeys) {
      // biome-ignore lint/performance/noAwaitInLoops: Radix radio updates race when clicked concurrently.
      await reviewer
        .locator("fieldset")
        .filter({ has: reviewer.locator(`#${key}-PASSED`) })
        .getByRole("radio", { name: "Passed" })
        .check();
    }
    await reviewer
      .locator("fieldset")
      .filter({ has: reviewer.locator("#legal-notices-FAILED") })
      .getByRole("radio", { name: "Failed" })
      .check();
    await reviewer
      .getByLabel("Consolidated correction message")
      .fill(secondCorrectionMessage);
    await mutation(
      reviewer,
      "POST",
      `/v1/operations/business-authority-cases/${caseId}/request-changes`,
      expectedChangesRequested(caseId),
      () => reviewer.getByRole("button", { name: "Request changes" }).click()
    );
    await expect(reviewer.getByText("CHANGES REQUESTED")).toHaveCount(2);

    await applicant.goto(`${proOrigin}/business-application`);
    await expect(applicant.getByText(secondCorrectionMessage)).toBeVisible();
    await applicant
      .getByLabel("PACRA document description")
      .fill(issue44Fixture.submission.pacraEvidenceDescription);
    const thirdSubmit = applicant.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/v1/business-applications/current/submit"
    );
    const thirdSave = applicant.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === "/v1/business-applications/current"
    );
    await applicant.getByRole("button", { name: "Submit for review" }).click();
    const thirdSaveEnvelope = await expectSuccessfulEnvelope(
      await thirdSave,
      expectedDraftSaved("CHANGES_REQUESTED")
    );
    const thirdSubmitResponse = await thirdSubmit;
    const thirdSubmitEnvelope = await expectSuccessfulEnvelope(
      thirdSubmitResponse,
      expectedSubmitted(3, thirdSaveEnvelope.data.applicationId, caseId)
    );

    const submitIdempotencyKey = await thirdSubmitResponse
      .request()
      .headerValue("idempotency-key");
    expect(submitIdempotencyKey).toBeTruthy();
    const submitReplayEnvelope = await expectSuccessfulEnvelope(
      await applicantContext.request.post(
        `${apiOrigin}/v1/business-applications/current/submit`,
        { headers: { "idempotency-key": submitIdempotencyKey ?? "" } }
      ),
      expectedSubmitted(3, thirdSaveEnvelope.data.applicationId, caseId)
    );
    expect(submitReplayEnvelope.data).toEqual(thirdSubmitEnvelope.data);

    await reviewer.goto(`${opsOrigin}/business-authority-cases/${caseId}`);
    await expect(
      reviewer.getByText("Revision 3 - immutable submission (current)")
    ).toBeVisible();
    await expect(
      reviewer.getByText("Revision 2 - immutable submission", { exact: true })
    ).toBeVisible();
    await expect(
      reviewer.getByText("Revision 1 - immutable submission", { exact: true })
    ).toBeVisible();
    await expect(reviewer.getByText("APPLICATION RESUBMITTED")).toHaveCount(2);
    await mutation(
      reviewer,
      "POST",
      `/v1/operations/business-authority-cases/${caseId}/start-review`,
      expectedReviewStarted(caseId),
      () => reviewer.getByRole("button", { name: "Start review" }).click()
    );
    for (const key of mandatoryChecklistKeys) {
      // biome-ignore lint/performance/noAwaitInLoops: Radix radio updates race when clicked concurrently.
      await reviewer
        .locator("fieldset")
        .filter({ has: reviewer.locator(`#${key}-PASSED`) })
        .getByRole("radio", { name: "Passed" })
        .check();
    }
    const approveButton = reviewer.getByRole("button", {
      name: "Approve authority",
    });
    await reviewer.getByLabel("Consolidated correction message").focus();
    await reviewer.keyboard.press("Tab");
    await expectVisibleFocusIndicator(approveButton);
    await reviewer.keyboard.press("Shift+Tab");
    await expectVisibleFocusIndicator(
      reviewer.getByLabel("Consolidated correction message")
    );
    await approveButton.click();
    await expect(
      reviewer.getByRole("dialog", { name: "Approve this Business authority?" })
    ).toBeVisible();
    const approveResponse = await mutation(
      reviewer,
      "POST",
      `/v1/operations/business-authority-cases/${caseId}/approve`,
      {
        authorizationId: anyId(),
        businessId: anyId(),
        kind: "APPROVED",
        organizationId: anyId(),
      },
      () => reviewer.getByRole("button", { name: "Confirm approval" }).click()
    );
    await expect(reviewer.getByText("APPLICATION APPROVED")).toBeVisible();

    const approveEnvelope = await approveResponse.json();
    const approveIdempotencyKey = await approveResponse
      .request()
      .headerValue("idempotency-key");
    expect(approveIdempotencyKey).toBeTruthy();
    const approveReplayEnvelope = await expectSuccessfulEnvelope(
      await reviewerContext.request.post(
        `${apiOrigin}/v1/operations/business-authority-cases/${caseId}/approve`,
        {
          data: {
            checklist: mandatoryChecklistKeys.map((key) => ({
              checklistVersion: "business-authority-v1",
              key,
              state: "PASSED",
            })),
          },
          headers: { "idempotency-key": approveIdempotencyKey ?? "" },
        }
      ),
      {
        authorizationId: anyId(),
        businessId: anyId(),
        kind: "APPROVED",
        organizationId: anyId(),
      }
    );
    expect(approveReplayEnvelope.data).toEqual(approveEnvelope.data);

    const projection = await approvedProjection(sql);
    const state = await approvedDatabaseState(sql, projection);
    expect(state.revisionCount).toBe(3);
    expect(state.revisions.map((revision) => revision.revisionNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(state.revisions[0]?.submissionHash).toBe(
      state.revisions[2]?.submissionHash
    );
    expect(state.revisions[1]?.submissionHash).not.toBe(
      state.revisions[0]?.submissionHash
    );
    const revisionIdByNumber = new Map(
      state.revisions.map((revision) => [revision.revisionNumber, revision.id])
    );
    expect(state.checklist).toHaveLength(27);
    for (const reviewSequence of [1, 2, 3]) {
      const outcomes = state.checklist.filter(
        (item) => item.reviewSequence === reviewSequence
      );
      expect(outcomes).toHaveLength(9);
      for (const outcome of outcomes) {
        expect(outcome.revisionId).toBe(revisionIdByNumber.get(reviewSequence));
      }
    }
    expect(state.approvedRevisionId).toBe(revisionIdByNumber.get(3));
    expect(state.reviewedRevisionId).toBe(revisionIdByNumber.get(3));
    expect(state.eventKinds).toEqual([
      "APPLICATION_SUBMITTED",
      "REVIEW_STARTED",
      "CHANGES_REQUESTED",
      "APPLICATION_RESUBMITTED",
      "REVIEW_STARTED",
      "CHANGES_REQUESTED",
      "APPLICATION_RESUBMITTED",
      "REVIEW_STARTED",
      "APPLICATION_APPROVED",
    ]);
    expect(state.authorizationCount).toBe(1);
    expect(state.authorizationState).toBe("ACTIVE");
    expect(state.permissionCount).toBe(1);
    expect(state.organizationCount).toBe(1);
    expect(state.applicantMembershipCount).toBe(1);
    expect(state.projectionMembershipCount).toBe(1);
    expect(state.sessions).toEqual(expectedSessionSelection(null));
    expect(state.auditKinds.toSorted()).toEqual(
      [
        "BUSINESS_APPLICATION_REVIEW_DECIDED",
        "BUSINESS_APPLICATION_REVIEW_DECIDED",
        "BUSINESS_APPLICATION_REVIEW_DECIDED",
        "BUSINESS_APPLICATION_REVIEW_STARTED",
        "BUSINESS_APPLICATION_REVIEW_STARTED",
        "BUSINESS_APPLICATION_REVIEW_STARTED",
        "BUSINESS_APPLICATION_SUBMITTED",
        "BUSINESS_APPLICATION_SUBMITTED",
        "BUSINESS_APPLICATION_SUBMITTED",
        "REPRESENTATIVE_AUTHORIZATION_ACTIVATED",
      ].toSorted()
    );

    await applicant.goto(`${proOrigin}/business-application`);
    await expect(
      applicant.getByText("Select your Business", { exact: true })
    ).toBeVisible();
    await mutation(
      applicant,
      "POST",
      `/v1/businesses/${projection.businessId}/select`,
      {
        businessId: projection.businessId,
        kind: "BUSINESS_SELECTED",
      },
      () => applicant.getByRole("button", { name: "Select Business" }).click()
    );
    await expect(applicant).toHaveURL(
      `${proOrigin}/businesses/${projection.businessId}`
    );
    await expect(
      applicant.getByRole("heading", {
        name: issue44Fixture.submission.registeredName,
      })
    ).toBeVisible();
    await expect(
      applicant.getByText(`Trading as ${issue44Fixture.submission.tradingName}`)
    ).toBeVisible();
    await expect(applicant.getByText("Business Administration")).toBeVisible();
    await expect(applicant.getByText(accessTimestampPattern)).toBeVisible();

    const duplicateContext = await authenticatedContext(
      browser,
      issue44Fixture.duplicateApplicant
    );
    const duplicate = await duplicateContext.newPage();
    browserFailureGroups.push(watchBrowserFailures(duplicate));
    await duplicate.goto(`${proOrigin}/business-application`);
    await fillApplication(duplicate);
    const duplicateResponsePromise = duplicate.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === "/v1/business-applications/current"
    );
    await duplicate.getByRole("button", { name: "Save draft" }).click();
    const duplicateResponse = await duplicateResponsePromise;
    expect(duplicateResponse.status()).toBe(409);
    await expect(duplicateResponse.json()).resolves.toEqual({
      error: {
        code: "RECOVERY_OR_JOINING_REQUIRED",
        message:
          "Continue through account recovery or request to join the Business.",
      },
      ok: false,
      requestId: expect.any(String),
    });
    await expect(
      duplicate.getByText("Continue through recovery or joining", {
        exact: true,
      })
    ).toBeVisible();
    await expect(
      duplicate.getByText(issue44Fixture.submission.registeredName)
    ).toHaveCount(0);

    const foreignContext = await authenticatedContext(
      browser,
      issue44Fixture.foreignApplicant
    );
    const foreignSubmission = submissionForForeignBusiness();
    const foreignSave = await expectSuccessfulEnvelope(
      await foreignContext.request.put(
        `${apiOrigin}/v1/business-applications/current`,
        { data: { submission: foreignSubmission } }
      ),
      expectedDraftSaved("DRAFT")
    );
    const foreignSubmit = await expectSuccessfulEnvelope(
      await foreignContext.request.post(
        `${apiOrigin}/v1/business-applications/current/submit`,
        { headers: { "idempotency-key": crypto.randomUUID() } }
      ),
      expectedSubmitted(1, foreignSave.data.applicationId)
    );
    const foreignCaseId = foreignSubmit.data.caseId as string;
    await expectSuccessfulEnvelope(
      await reviewerContext.request.post(
        `${apiOrigin}/v1/operations/business-authority-cases/${foreignCaseId}/start-review`,
        { headers: { "idempotency-key": crypto.randomUUID() } }
      ),
      expectedReviewStarted(foreignCaseId, foreignSave.data.applicationId)
    );
    await expectSuccessfulEnvelope(
      await reviewerContext.request.post(
        `${apiOrigin}/v1/operations/business-authority-cases/${foreignCaseId}/approve`,
        {
          data: {
            checklist: mandatoryChecklistKeys.map((key) => ({
              checklistVersion: "business-authority-v1",
              key,
              state: "PASSED",
            })),
          },
          headers: { "idempotency-key": crypto.randomUUID() },
        }
      ),
      {
        authorizationId: anyId(),
        businessId: anyId(),
        kind: "APPROVED",
        organizationId: anyId(),
      }
    );
    const foreignProjection = await approvedProjection(
      sql,
      issue44Fixture.foreignApplicant.id
    );

    await seedMembershipWithoutAuthority(sql, projection.organizationId);
    const memberContext = await authenticatedContext(
      browser,
      issue44Fixture.membershipOnlyUser
    );
    const memberResponse = await memberContext.request.post(
      `${apiOrigin}/v1/businesses/${projection.businessId}/select`
    );
    expect(memberResponse.status()).toBe(403);
    await expect(memberResponse.json()).resolves.toEqual({
      error: {
        code: "AUTHORIZATION_INACTIVE",
        message: "Business authority access is denied.",
      },
      ok: false,
      requestId: expect.any(String),
    });
    const memberPage = await memberContext.newPage();
    browserFailureGroups.push(watchBrowserFailures(memberPage));
    await memberPage.goto(`${proOrigin}/businesses/${projection.businessId}`);
    await expect(
      memberPage.getByText("Business access is required")
    ).toBeVisible();

    const crossBusinessContext = await authenticatedContext(
      browser,
      issue44Fixture.applicant
    );
    const crossBusinessPage = await crossBusinessContext.newPage();
    browserFailureGroups.push(watchBrowserFailures(crossBusinessPage));
    const crossBusinessResponse = await crossBusinessContext.request.get(
      `${apiOrigin}/v1/businesses/${foreignProjection.businessId}/access`
    );
    expect(crossBusinessResponse.status()).toBe(403);
    const crossBusinessEnvelope = await crossBusinessResponse.json();
    expect(crossBusinessEnvelope).toEqual({
      error: {
        code: "BUSINESS_NOT_SELECTED",
        message: "Business authority access is denied.",
      },
      ok: false,
      requestId: expect.any(String),
    });
    const foreignSensitiveValues = [
      foreignSubmission.identity.registeredName,
      foreignSubmission.identity.tradingName,
      foreignSubmission.identity.pacraRegistrationNumber,
      foreignProjection.businessId,
      foreignSubmission.applicant.displayName,
      foreignSubmission.applicant.position,
      foreignSubmission.authority.basis,
      ...foreignSubmission.authority.evidenceIds,
      ...foreignSubmission.evidence.flatMap((evidence) => [
        evidence.id,
        evidence.name,
      ]),
    ];
    for (const sensitiveValue of foreignSensitiveValues) {
      expect(JSON.stringify(crossBusinessEnvelope)).not.toContain(
        sensitiveValue
      );
    }
    await crossBusinessPage.goto(
      `${proOrigin}/businesses/${foreignProjection.businessId}`,
      { timeout: 15_000, waitUntil: "domcontentloaded" }
    );
    await expect(
      crossBusinessPage.getByText("Business access is required")
    ).toBeVisible();
    const crossBusinessPageText = await crossBusinessPage
      .locator("body")
      .innerText();
    for (const sensitiveValue of foreignSensitiveValues) {
      expect(crossBusinessPageText).not.toContain(sensitiveValue);
    }

    const finalState = await approvedDatabaseState(sql, projection);
    expect(finalState.projectionMembershipCount).toBe(2);
    expect(finalState.sessions).toEqual(
      expectedSessionSelection(projection.organizationId)
    );
    const grantedAccess = finalState.accessAudit.filter(
      (event) => event.kind === "BUSINESS_ACCESS_GRANTED"
    );
    expect(grantedAccess).toEqual([
      {
        accountId: issue44Fixture.applicant.id,
        applicationId: null,
        businessId: projection.businessId,
        caseId: null,
        code: null,
        kind: "BUSINESS_ACCESS_GRANTED",
        requestedBusinessId: projection.businessId,
      },
    ]);
    const deniedAccess = finalState.accessAudit.filter(
      (event) => event.kind === "BUSINESS_ACCESS_DENIED"
    );
    expect(deniedAccess).toHaveLength(3);
    expect(
      deniedAccess.filter(
        (event) => event.accountId === issue44Fixture.applicant.id
      )
    ).toEqual([
      {
        accountId: issue44Fixture.applicant.id,
        applicationId: null,
        businessId: null,
        caseId: null,
        code: "BUSINESS_NOT_SELECTED",
        kind: "BUSINESS_ACCESS_DENIED",
        requestedBusinessId: foreignProjection.businessId,
      },
      {
        accountId: issue44Fixture.applicant.id,
        applicationId: null,
        businessId: null,
        caseId: null,
        code: "BUSINESS_NOT_SELECTED",
        kind: "BUSINESS_ACCESS_DENIED",
        requestedBusinessId: foreignProjection.businessId,
      },
    ]);
    expect(
      deniedAccess.filter(
        (event) => event.accountId === issue44Fixture.membershipOnlyUser.id
      )
    ).toEqual([
      {
        accountId: issue44Fixture.membershipOnlyUser.id,
        applicationId: null,
        businessId: null,
        caseId: null,
        code: "BUSINESS_NOT_SELECTED",
        kind: "BUSINESS_ACCESS_DENIED",
        requestedBusinessId: projection.businessId,
      },
    ]);
    for (const event of deniedAccess) {
      expect(event.applicationId).toBeNull();
      expect(event.businessId).toBeNull();
      expect(event.caseId).toBeNull();
    }
    expect(browserFailureGroups.flat()).toEqual([]);
  } finally {
    await cleanupBusinessAuthorityScenario(sql);
    await sql.end();
  }
});
