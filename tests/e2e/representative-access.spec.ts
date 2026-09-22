import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  representativeAccessActors,
  representativeAccessFixture,
} from "./fixtures/representative-access.ts";
import {
  betterAuthSessionCookieName,
  signBetterAuthSessionToken,
} from "./helpers/auth-session.ts";
import { opsOrigin, proOrigin } from "./helpers/origins.ts";
import {
  expirePendingInvitation,
  latestPendingRepresentativePermissionCaseId,
  openRepresentativeAccessE2eDatabase,
  representativeAccessDatabaseState,
  resetRepresentativeAccessE2eDatabase,
  seedRepresentativeAccessScenario,
} from "./helpers/representative-access-database.ts";

const secret =
  process.env.BETTER_AUTH_SECRET ??
  "issue-44-e2e-secret-that-is-at-least-32-characters";
const expiredEmail = `expired-${representativeAccessFixture.runId}@example.test`;

interface SessionActor {
  readonly token: string;
}

async function authenticatedContext(
  browser: Browser,
  actor: SessionActor,
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

function watchUnexpectedBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") {
      failures.push(
        `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`
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

async function createInvitation(page: Page, email: string) {
  const linkContainer = page
    .getByText("Share this link securely", { exact: true })
    .locator("..");
  const previousUrl = (await linkContainer.count())
    ? await linkContainer.locator("p").nth(1).textContent()
    : null;
  await page.getByLabel("Account email").fill(email);
  await page.getByRole("button", { name: "Create secure invitation" }).click();
  await expect(linkContainer).toBeVisible();
  const linkValue = linkContainer.locator("p").nth(1);
  await expect.poll(() => linkValue.textContent()).not.toBe(previousUrl);
  const invitationUrl = await linkValue.textContent();
  if (!invitationUrl?.startsWith(`${proOrigin}/representative-invitations/`)) {
    throw new Error("The secure invitation URL was not rendered.");
  }
  return invitationUrl;
}

async function passRepresentativeChecklist(page: Page) {
  const passedOutcomes = page.getByRole("radio", { name: "Passed" });
  await expect(passedOutcomes).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const outcome = passedOutcomes.nth(index);
    // biome-ignore lint/performance/noAwaitInLoops: Radix control state must settle between browser interactions.
    await outcome.click();
    await expect(outcome).toHaveAttribute("aria-checked", "true");
  }
}

test.describe("Representative access browser journey", () => {
  let database: Awaited<ReturnType<typeof openRepresentativeAccessE2eDatabase>>;

  test.beforeAll(async () => {
    database = await openRepresentativeAccessE2eDatabase();
    await resetRepresentativeAccessE2eDatabase(database);
    await seedRepresentativeAccessScenario(database);
  });

  test.afterAll(async () => {
    await database.end();
  });

  test("keeps invitation authority pending, approves it, and scopes verified reduction", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { business, foreignBusiness, representativeForeignSession } =
      representativeAccessFixture;
    const actors = representativeAccessActors;
    const adminContext = await authenticatedContext(
      browser,
      actors.administrator
    );
    const adminPage = await adminContext.newPage();
    const adminFailures = watchUnexpectedBrowserFailures(adminPage);

    await adminPage.goto(
      `${proOrigin}/businesses/${business.id}/representatives`
    );
    await expect(
      adminPage.getByRole("heading", { level: 1, name: "Representatives" })
    ).toBeVisible();
    await expect(adminPage.getByText("Issue 45 Parts Limited")).toHaveCount(0);
    await expectNoHorizontalOverflow(adminPage);

    const invitationUrl = await createInvitation(
      adminPage,
      actors.invitee.email
    );
    const expiredInvitationUrl = await createInvitation(
      adminPage,
      expiredEmail
    );
    await expirePendingInvitation(database, expiredEmail);

    const publicContext = await browser.newContext({
      viewport: { height: 844, width: 390 },
    });
    await publicContext.route("https://va.vercel-scripts.com/**", (route) =>
      route.fulfill({ status: 204 })
    );
    const expiredPage = await publicContext.newPage();
    const expiredFailures = watchUnexpectedBrowserFailures(expiredPage);
    await expiredPage.goto(expiredInvitationUrl);
    await expect(expiredPage.getByText("Invitation expired")).toBeVisible();
    await expectNoHorizontalOverflow(expiredPage);
    expect(expiredFailures).toEqual([]);
    await publicContext.close();

    const inviteeContext = await authenticatedContext(browser, actors.invitee, {
      height: 1000,
      width: 390,
    });
    const invitationPage = await inviteeContext.newPage();
    const invitationFailures = watchUnexpectedBrowserFailures(invitationPage);
    await invitationPage.goto(invitationUrl);
    await expect(
      invitationPage.getByRole("heading", {
        level: 1,
        name: "Issue 45 Mobility Limited",
      })
    ).toBeVisible();
    await expect(
      invitationPage.getByText("Business access stays locked")
    ).toBeVisible();
    await invitationPage.getByLabel("Full name").fill(actors.invitee.name);
    await invitationPage
      .getByLabel("Position at the Business")
      .fill("Sales manager");
    await invitationPage
      .getByLabel("Verified WhatsApp number")
      .fill("+260961234567");
    await invitationPage
      .getByLabel("Verified phone reference")
      .fill(`phone://${representativeAccessFixture.runId}/invitee`);
    await invitationPage
      .getByLabel("Authority evidence reference")
      .fill(`evidence://${representativeAccessFixture.runId}/authority`);
    await invitationPage
      .getByLabel("Authority evidence description")
      .fill("Signed representative mandate");
    await invitationPage
      .getByLabel("Identity evidence reference")
      .fill(`evidence://${representativeAccessFixture.runId}/identity`);
    await invitationPage
      .getByLabel("Identity evidence description")
      .fill("National registration card");
    for (const checkbox of await invitationPage.getByRole("checkbox").all()) {
      // biome-ignore lint/performance/noAwaitInLoops: Radix control state must settle between browser interactions.
      await checkbox.click();
      await expect(checkbox).toHaveAttribute("aria-checked", "true");
    }
    await invitationPage
      .getByRole("button", { name: "Submit for Operations review" })
      .click();
    await expect(
      invitationPage.getByText(
        "Authority evidence submitted. Operations must approve it before this account can access the Business."
      )
    ).toBeVisible();
    await expectNoHorizontalOverflow(invitationPage);
    expect(invitationFailures).toEqual([]);
    expect(
      (await representativeAccessDatabaseState(database)).inviteeMembershipCount
    ).toBe(0);
    await invitationPage.goto(`${proOrigin}/business-application`);
    await expect(
      invitationPage.getByRole("heading", { name: "Your Business access" })
    ).toHaveCount(0);

    const reviewerContext = await authenticatedContext(
      browser,
      actors.reviewer
    );
    const reviewerPage = await reviewerContext.newPage();
    const reviewerFailures = watchUnexpectedBrowserFailures(reviewerPage);
    await reviewerPage.goto(`${opsOrigin}/representative-access-cases`);
    await expect(
      reviewerPage.getByRole("heading", {
        level: 1,
        name: "Representative access cases",
      })
    ).toBeVisible();
    await reviewerPage.getByRole("link", { name: "Open case" }).click();
    await expect(
      reviewerPage.getByRole("heading", {
        level: 1,
        name: actors.invitee.name,
      })
    ).toBeVisible();
    await expect(
      reviewerPage.getByText("Immutable private evidence")
    ).toBeVisible();
    await reviewerPage.getByRole("button", { name: "Start review" }).click();
    await expect(
      reviewerPage.getByRole("heading", { name: "Authority checklist" })
    ).toBeVisible();
    await passRepresentativeChecklist(reviewerPage);
    await reviewerPage.getByRole("button", { name: "Approve access" }).click();
    await expect(
      reviewerPage.getByText("Representative access approved.")
    ).toBeVisible();
    await expectNoHorizontalOverflow(reviewerPage);
    expect(reviewerFailures).toEqual([]);
    expect(
      (await representativeAccessDatabaseState(database)).inviteeMembershipCount
    ).toBe(1);
    await invitationPage.goto(`${proOrigin}/business-application`);
    const inviteeAccess = invitationPage
      .getByRole("listitem")
      .filter({ hasText: "Issue 45 Mobility Limited" });
    await expect(inviteeAccess).toBeVisible();
    await inviteeAccess
      .getByRole("button", { name: "Select Issue 45 Mobility Limited" })
      .click();
    await expect(
      invitationPage.getByRole("heading", {
        level: 1,
        name: actors.invitee.name,
      })
    ).toBeVisible();
    await expect(invitationPage.getByText("Your own authority")).toBeVisible();
    await expect(
      invitationPage.getByRole("link", { name: "Back to Business access" })
    ).toBeVisible();
    await invitationPage.goto(
      `${proOrigin}/businesses/${business.id}/representatives/${business.representativeAuthorizationId}/history`
    );
    await expect(
      invitationPage.getByText("Private authority history unavailable")
    ).toBeVisible();
    await invitationPage.goto(
      `${proOrigin}/businesses/${business.id}/representatives`
    );
    await expect(
      invitationPage.getByText("Business Administration permission required")
    ).toBeVisible();

    const staleContext = await authenticatedContext(
      browser,
      actors.staleAdministrator
    );
    const stalePage = await staleContext.newPage();
    await stalePage.goto(
      `${proOrigin}/businesses/${business.id}/representatives`
    );
    const staleTargetCard = stalePage
      .getByRole("listitem")
      .filter({ hasText: actors.representative.name });
    await staleTargetCard
      .getByRole("button", { name: "Revoke Business sessions" })
      .click();
    await expect(
      stalePage.getByText(
        "Sign in again, return to this Business, then retry the sensitive action."
      )
    ).toBeVisible();
    await staleContext.close();

    await adminPage.reload();
    const adminCard = adminPage
      .getByRole("listitem")
      .filter({ hasText: actors.administrator.name });
    await expect(
      adminCard.getByRole("heading", { name: actors.administrator.name })
    ).toBeVisible();
    await adminCard.getByText("Change permissions").click();
    await expect(
      adminCard.getByText(
        "This is the last active Business Administrator. Assign another one before reducing or removing this access."
      )
    ).toBeVisible();
    await expect(
      adminCard.getByRole("button", { name: "Remove Representative" })
    ).toBeDisabled();

    const targetCard = adminPage
      .getByRole("listitem")
      .filter({ hasText: actors.representative.name });
    await targetCard.getByText("Change permissions").click();
    const administrationPermission = targetCard.getByLabel(
      "Business administration"
    );
    await administrationPermission.click();
    await expect(administrationPermission).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await targetCard
      .getByRole("button", { name: "Request Operations review" })
      .click();
    await expect(
      adminPage.getByText("Permission addition sent to Operations for review.")
    ).toBeVisible();
    const permissionCaseId =
      await latestPendingRepresentativePermissionCaseId(database);
    if (!permissionCaseId) {
      throw new Error("The permission addition case was not persisted.");
    }
    await reviewerPage.goto(
      `${opsOrigin}/representative-access-cases/${permissionCaseId}`
    );
    await reviewerPage.getByRole("button", { name: "Start review" }).click();
    await expect(
      reviewerPage.getByRole("heading", { name: "Authority checklist" })
    ).toBeVisible();
    await passRepresentativeChecklist(reviewerPage);
    await reviewerPage
      .getByRole("button", { name: "Propose approval" })
      .click();
    await expect(
      reviewerPage.getByText(
        "Decision Proposal recorded for Independent Review."
      )
    ).toBeVisible();

    const independentReviewerContext = await authenticatedContext(
      browser,
      actors.independentReviewer
    );
    const independentReviewerPage = await independentReviewerContext.newPage();
    const independentReviewerFailures = watchUnexpectedBrowserFailures(
      independentReviewerPage
    );
    await independentReviewerPage.goto(
      `${opsOrigin}/representative-access-cases/${permissionCaseId}`
    );
    await independentReviewerPage
      .getByRole("button", { name: "Confirm proposal" })
      .click();
    await expect(
      independentReviewerPage.getByText(
        "Independent Review confirmed and the effect was applied."
      )
    ).toBeVisible();
    expect(independentReviewerFailures).toEqual([]);
    await independentReviewerContext.close();

    await adminPage.reload();
    const promotedTargetCard = adminPage
      .getByRole("listitem")
      .filter({ hasText: actors.representative.name });
    await expect(
      promotedTargetCard.getByText("Business administration").first()
    ).toBeVisible();
    await promotedTargetCard.getByText("Change permissions").click();
    const listingPermission =
      promotedTargetCard.getByLabel("Listing management");
    await listingPermission.click();
    await expect(listingPermission).toHaveAttribute("aria-checked", "true");
    await promotedTargetCard
      .getByRole("button", { name: "Apply verified reduction" })
      .click();
    await expect(
      adminPage.getByRole("heading", { name: "Verify on WhatsApp" })
    ).toBeVisible();
    await adminPage
      .getByLabel("Six-digit WhatsApp verification code")
      .fill("451045");
    await adminPage.getByRole("button", { name: "Verify and apply" }).click();
    await expect(
      adminPage.getByText("The verified Business access change is complete.")
    ).toBeVisible();

    const finalState = await representativeAccessDatabaseState(database);
    expect(finalState.permissions).toEqual(["LISTING_MANAGEMENT"]);
    expect(finalState.sessions).toEqual([foreignBusiness.organizationId]);
    expect(finalState.foreignPermissionCount).toBe(1);
    expect(adminFailures).toEqual([]);

    const foreignContext = await authenticatedContext(browser, {
      token: representativeForeignSession.token,
    });
    const foreignPage = await foreignContext.newPage();
    await foreignPage.goto(
      `${proOrigin}/businesses/${business.id}/representatives`
    );
    await expect(
      foreignPage.getByText("Business Administration permission required")
    ).toBeVisible();
    await foreignContext.close();

    await reviewerContext.close();
    await inviteeContext.close();
    await adminContext.close();
  });
});
