import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import {
  completeVehicleListingSubmission,
  vehicleListingActors,
  vehicleListingClock,
  vehicleListingFixture,
  vehicleListingMediaOrigin,
} from "./fixtures/vehicle-listing.ts";
import {
  betterAuthSessionCookieName,
  signBetterAuthSessionToken,
} from "./helpers/auth-session.ts";
import {
  type FocusIndicatorStyle,
  hasVisibleFocusDifference,
} from "./helpers/focus-indicator.ts";
import {
  apiOrigin,
  opsOrigin,
  proOrigin,
  webOrigin,
} from "./helpers/origins.ts";
import {
  currentVehicleListingCaseId,
  openVehicleListingE2eDatabase,
  resetVehicleListingScenario,
  seedVehicleListingAuthority,
  uploadedVehicleListingAssetId,
} from "./helpers/vehicle-listing-database.ts";

const secret =
  process.env.BETTER_AUTH_SECRET ??
  "issue-44-e2e-secret-that-is-at-least-32-characters";
const { fixedNow } = vehicleListingClock;
const privacyProjectionPattern =
  /VIN, chassis, Review Evidence, and internal history/;
const revisionOneSubmittedPattern = /Revision 1 submitted/;
const changesRequestedRevisionOnePattern = /Changes requested for revision 1/;
const revisionTwoSubmittedPattern = /Revision 2 submitted/;
const directContactPattern = /inquir|contact/i;
const noindexPattern = /noindex/;
const vehicleListingMediaFixturePath = fileURLToPath(
  new URL("./fixtures/e2e-vehicle.svg", import.meta.url)
);
const vehicleListingUploadFixturePath = fileURLToPath(
  new URL("../../apps/pro/app/icon.png", import.meta.url)
);

interface Actor {
  readonly token: string;
}

interface BrowserHttpInput {
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly method?: string;
  readonly path: string;
}

type Sql = Awaited<ReturnType<typeof openVehicleListingE2eDatabase>>;
let sql: Sql;

test.describe.configure({ mode: "serial", retries: 0, timeout: 600_000 });

test.beforeAll(async () => {
  sql = await openVehicleListingE2eDatabase();
  await resetVehicleListingScenario(sql);
  await seedVehicleListingAuthority(sql);
});

test.afterAll(async () => {
  if (sql) {
    await resetVehicleListingScenario(sql);
    await sql.end();
  }
});

async function installVehicleListingMediaFixture(context: BrowserContext) {
  await context.route(`${vehicleListingMediaOrigin}/**`, async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=31536000, immutable",
        "cross-origin-resource-policy": "cross-origin",
      },
      path: vehicleListingMediaFixturePath,
    });
  });
}

async function authenticatedContext(
  browser: Browser,
  actor: Actor,
  viewport = { height: 1000, width: 1440 }
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  await installVehicleListingMediaFixture(context);
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

async function browserHttp<T>(page: Page, input: BrowserHttpInput) {
  const response = await page
    .context()
    .request.fetch(`${apiOrigin}${input.path}`, {
      data: input.body,
      headers: {
        "x-marliket-e2e-now": fixedNow,
        ...(input.idempotencyKey
          ? { "idempotency-key": input.idempotencyKey }
          : {}),
      },
      method: input.method ?? "GET",
    });
  return {
    body: (await response.json()) as {
      data?: T;
      error?: { code: string; message: string };
      ok: boolean;
      requestId: string;
    },
    status: response.status(),
  };
}

async function uploadListingAssetThroughWorker(
  page: Page,
  input: {
    readonly collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
    readonly content: Buffer;
    readonly fileName: string;
    readonly listingId: string;
  }
) {
  const { business } = vehicleListingFixture;
  const contentType = "image/png" as const;
  const reservation = await browserHttp<{
    assetId: string;
    uploadPath: string;
  }>(page, {
    body: {
      collection: input.collection,
      contentType,
      fileName: input.fileName,
      sha256: createHash("sha256").update(input.content).digest("hex"),
      sizeBytes: input.content.byteLength,
    },
    idempotencyKey: crypto.randomUUID(),
    method: "POST",
    path: `/v1/businesses/${business.id}/vehicle-listings/${input.listingId}/assets`,
  });
  expect(reservation.status).toBe(200);
  const authorization = reservation.body.data;
  if (!authorization) {
    throw new Error("The Listing asset upload reservation is missing.");
  }
  const response = await page
    .context()
    .request.fetch(`${apiOrigin}${authorization.uploadPath}`, {
      data: input.content,
      headers: {
        "content-length": String(input.content.byteLength),
        "content-type": contentType,
        "idempotency-key": crypto.randomUUID(),
        "x-marliket-e2e-now": fixedNow,
      },
      method: "PUT",
    });
  const body = (await response.json()) as {
    data?: { assetId: string };
    error?: { code: string; message: string };
  };
  expect(response.status()).toBe(200);
  expect(body.data?.assetId).toBe(authorization.assetId);
  return authorization.assetId;
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
    .locator(
      "input:not([type=hidden]):not([aria-hidden=true]), select:not([aria-hidden=true]), textarea:not([aria-hidden=true])"
    )
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

async function focusStyle(control: Locator): Promise<FocusIndicatorStyle> {
  return await control.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      boxShadow: computed.boxShadow,
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth),
    };
  });
}

async function expectVisibleKeyboardFocus(control: Locator) {
  const unfocused = await focusStyle(control);
  await control.focus();
  await control.page().keyboard.press("Tab");
  await control.page().keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  expect(hasVisibleFocusDifference(await focusStyle(control), unfocused)).toBe(
    true
  );
}

async function passEveryChecklistItem(page: Page) {
  const checklistOutcomes = page.getByRole("combobox");
  await expect(checklistOutcomes).toHaveCount(16);
  const passNext = async (remaining: readonly Locator[]): Promise<void> => {
    const [outcome, ...rest] = remaining;
    if (!outcome) {
      return;
    }
    await outcome.click();
    await page.getByRole("option", { exact: true, name: "Passed" }).click();
    return passNext(rest);
  };
  await passNext(await checklistOutcomes.all());
}

test("uploads Listing assets through the Worker and carries a corrected Vehicle Listing through review, publication, unavailability, and Sold", async ({
  browser,
}) => {
  const proContext = await authenticatedContext(
    browser,
    vehicleListingActors.administrator
  );
  const opsContext = await authenticatedContext(
    browser,
    vehicleListingActors.reviewer
  );
  const publicContext = await browser.newContext({
    viewport: { height: 1000, width: 1440 },
  });
  await installVehicleListingMediaFixture(publicContext);
  const proPage = await proContext.newPage();
  const opsPage = await opsContext.newPage();
  const publicPage = await publicContext.newPage();
  const proFailures = watchBrowserFailures(proPage);
  const opsFailures = watchBrowserFailures(opsPage);
  const publicFailures = watchBrowserFailures(publicPage);
  const { business } = vehicleListingFixture;

  await proPage.goto(`${proOrigin}/businesses/${business.id}/listings`);
  await expect(
    proPage.getByRole("heading", { exact: true, name: "Vehicle Listings" })
  ).toBeVisible();
  await proPage.getByRole("button", { name: "Create Vehicle Listing" }).click();
  await proPage.waitForURL(
    new RegExp(`/businesses/${business.id}/listings/[0-9a-f-]+$`)
  );
  const listingId = proPage.url().split("/").at(-1);
  if (!listingId) {
    throw new Error(
      "The created Vehicle Listing identifier was not in the URL."
    );
  }
  await proPage
    .getByLabel("Choose Public Media files")
    .setInputFiles(vehicleListingUploadFixturePath);
  const publicUploadQueue = proPage.getByRole("list", {
    name: "Public Media upload queue",
  });
  await expect(
    publicUploadQueue.getByText("Ready and attached to draft")
  ).toBeVisible();
  await proPage
    .getByLabel("Choose Review Evidence files")
    .setInputFiles(vehicleListingUploadFixturePath);
  const evidenceUploadQueue = proPage.getByRole("list", {
    name: "Review Evidence upload queue",
  });
  await expect(
    evidenceUploadQueue.getByText("Ready and attached to draft")
  ).toBeVisible();
  const uploadedPublicAssetId = await uploadedVehicleListingAssetId(sql, {
    collection: "PUBLIC_MEDIA",
    fileName: "icon.png",
    listingId,
  });
  const uploadedEvidenceAssetId = await uploadedVehicleListingAssetId(sql, {
    collection: "REVIEW_EVIDENCE",
    fileName: "icon.png",
    listingId,
  });
  const uploadFixture = await readFile(vehicleListingUploadFixturePath);
  const additionalPublicAssetIds = await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      uploadListingAssetThroughWorker(proPage, {
        collection: "PUBLIC_MEDIA",
        content: Buffer.concat([
          uploadFixture,
          Buffer.from(`public-${index + 2}`),
        ]),
        fileName: `vehicle-${index + 2}.png`,
        listingId,
      })
    )
  );
  const additionalEvidenceAssetIds = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      uploadListingAssetThroughWorker(proPage, {
        collection: "REVIEW_EVIDENCE",
        content: Buffer.concat([
          uploadFixture,
          Buffer.from(`evidence-${index + 2}`),
        ]),
        fileName: `evidence-${index + 2}.png`,
        listingId,
      })
    )
  );
  const submission = completeVehicleListingSubmission({
    evidenceAssetIds: [uploadedEvidenceAssetId, ...additionalEvidenceAssetIds],
    publicAssetIds: [uploadedPublicAssetId, ...additionalPublicAssetIds],
  });
  const savedDraft = await browserHttp<{ draftVersion: number }>(proPage, {
    body: { draft: submission, expectedDraftVersion: 0 },
    idempotencyKey: `issue-47-save-complete-${vehicleListingFixture.runId}`,
    method: "PUT",
    path: `/v1/businesses/${business.id}/vehicle-listings/${listingId}/draft`,
  });
  expect(savedDraft.status).toBe(200);
  expect(savedDraft.body.data?.draftVersion).toBe(1);

  await proPage.reload();
  await expect(proPage.getByLabel("Public title")).toHaveValue(
    vehicleListingFixture.initialTitle
  );
  await expectEveryFormControlLabelled(proPage);
  await proPage.setViewportSize({ height: 900, width: 320 });
  await expectNoHorizontalOverflow(proPage);
  await proPage.setViewportSize({ height: 1000, width: 1440 });
  await proPage.getByRole("tab", { name: "Public preview" }).click();
  await expect(proPage.getByText(privacyProjectionPattern)).toBeVisible();
  await proPage.getByRole("tab", { name: "Edit and history" }).click();
  await proPage.getByRole("button", { name: "Submit for review" }).click();
  await expect(
    proPage.locator('[data-slot="alert-description"]', {
      hasText: revisionOneSubmittedPattern,
    })
  ).toBeVisible();

  const opsResponse = await opsPage.goto(`${opsOrigin}/vehicle-listing-cases`);
  if (!opsResponse) {
    throw new Error("The Operations queue navigation returned no response.");
  }
  expect(opsResponse.status()).toBeLessThan(500);
  await expect(
    opsPage.getByRole("heading", { name: vehicleListingFixture.initialTitle })
  ).toBeVisible();
  await opsPage.getByRole("link", { name: "Open case" }).click();
  await expect(
    opsPage.getByText("Main showroom", { exact: true })
  ).toBeVisible();
  const resolvedBusinessLocation = opsPage
    .getByRole("definition")
    .filter({ hasText: "Main showroom" });
  await expect(resolvedBusinessLocation).toContainText(
    "Plot 47 Marketplace Road"
  );
  await expect(
    opsPage.getByText("Air conditioning, Reversing camera", { exact: true })
  ).toBeVisible();
  await expect(
    opsPage.getByText("Registration transfer fee", { exact: false })
  ).toBeVisible();
  await expect(
    opsPage.getByText("Public Media shows the exact Vehicle", { exact: false })
  ).toBeVisible();
  const privateEvidencePagePromise = opsContext.waitForEvent("page");
  await opsPage
    .getByRole("button", {
      name: "Open private evidence Vehicle identity record",
    })
    .click();
  const privateEvidencePage = await privateEvidencePagePromise;
  await privateEvidencePage.waitForLoadState("load");
  expect(privateEvidencePage.url()).toBe(
    `${apiOrigin}/v1/listing-assets/${uploadedEvidenceAssetId}/content`
  );
  await expect(privateEvidencePage.locator("img")).toBeVisible();
  expect(await privateEvidencePage.locator("body").innerText()).not.toContain(
    "grant="
  );
  await privateEvidencePage.close();
  await opsPage
    .getByRole("button", { name: "Start review and claim case" })
    .click();
  await expect(opsPage.getByRole("combobox")).toHaveCount(16);
  await opsPage
    .getByLabel("Consolidated Business message")
    .fill(
      "Use the exact evidence-supported public Vehicle title before resubmitting."
    );
  await opsPage.getByLabel("Correction 1 field path").fill("/title");
  await opsPage.getByLabel("Correction 1 code").fill("TITLE_MISMATCH");
  await opsPage
    .getByLabel("Correction 1 message")
    .fill(
      "Replace the draft title with the exact reviewed make, model, and variant."
    );
  await opsPage.getByRole("button", { name: "Request changes" }).click();
  await expect(
    opsPage.getByRole("heading", { name: "Changes requested" })
  ).toBeVisible();

  await proPage.reload();
  await expect(
    proPage.getByRole("heading", { name: changesRequestedRevisionOnePattern })
  ).toBeVisible();
  await proPage
    .getByLabel("Public title")
    .fill(vehicleListingFixture.reviewedTitle);
  await proPage
    .getByRole("button", { name: "Submit corrected revision" })
    .click();
  await expect(
    proPage.locator('[data-slot="alert-description"]', {
      hasText: revisionTwoSubmittedPattern,
    })
  ).toBeVisible({ timeout: 60_000 });

  const correctedCaseId = await currentVehicleListingCaseId(sql, listingId);
  await opsPage.goto(`${opsOrigin}/vehicle-listing-cases/${correctedCaseId}`);
  await expect(
    opsPage.getByRole("heading", { name: vehicleListingFixture.reviewedTitle })
  ).toBeVisible();
  await opsPage
    .getByRole("button", { name: "Start review and claim case" })
    .click();
  await passEveryChecklistItem(opsPage);
  await expectEveryFormControlLabelled(opsPage);
  await opsPage.setViewportSize({ height: 900, width: 320 });
  await expectNoHorizontalOverflow(opsPage);
  await opsPage.setViewportSize({ height: 1000, width: 1440 });
  await opsPage.getByRole("button", { name: "Approve and publish" }).click();
  await expect(
    opsPage.getByRole("heading", { name: "Approved and published" })
  ).toBeVisible();

  const publicResponse = await browserHttp<{
    canonicalPath: string;
    listingId: string;
  }>(proPage, {
    path: `/v1/public/vehicle-listings/${listingId}`,
  });
  expect(publicResponse.status).toBe(200);
  expect(publicResponse.body.data?.listingId).toBe(listingId);
  const canonicalPath = publicResponse.body.data?.canonicalPath;
  if (!canonicalPath) {
    throw new Error("The published Vehicle Listing canonical path is missing.");
  }

  await publicPage.goto(`${webOrigin}/en${canonicalPath}`);
  await expect(
    publicPage.getByRole("heading", {
      level: 1,
      name: vehicleListingFixture.reviewedTitle,
    })
  ).toBeVisible();
  await expect(publicPage.getByText("ZMW 735,000.00")).toBeVisible();
  await expect(
    publicPage.getByText("63,218 mi (101,740 km)", { exact: true })
  ).toBeVisible();
  await expect(
    publicPage.getByText("Small stone chip on the bonnet")
  ).toBeVisible();
  const disclosuresPrecedeHighlights = await publicPage.evaluate(() => {
    const headings = document.querySelectorAll(
      "#disclosures-heading, #highlights-heading"
    );
    return headings[0]?.id === "disclosures-heading";
  });
  expect(disclosuresPrecedeHighlights).toBe(true);
  const nextPhoto = publicPage.getByRole("button", {
    name: "Show next vehicle photo",
  });
  await expectVisibleKeyboardFocus(nextPhoto);
  await nextPhoto.click();
  await expect(publicPage.getByText("2 of 8")).toBeVisible();
  expect(await publicPage.locator("body").innerText()).not.toContain(
    vehicleListingFixture.vin
  );
  expect(await publicPage.content()).not.toContain("Vehicle identity record");
  await expect(
    publicPage.getByRole("button", { name: directContactPattern })
  ).toHaveCount(0);
  await publicPage.setViewportSize({ height: 900, width: 320 });
  await expectNoHorizontalOverflow(publicPage);
  await publicPage.setViewportSize({ height: 1000, width: 1440 });

  await proPage.goto(
    `${proOrigin}/businesses/${business.id}/listings/${listingId}`
  );
  await proPage.getByRole("link", { name: "Availability and routing" }).click();
  await proPage
    .getByLabel("Reason for unavailable or sold")
    .fill("Vehicle is temporarily held for an in-person inspection.");
  await proPage
    .getByRole("button", { name: "Mark temporarily unavailable" })
    .click();
  await expect(
    proPage.getByText("Availability: Temporarily unavailable")
  ).toBeVisible();

  await publicPage.reload();
  await expect(
    publicPage.getByRole("alert").filter({
      hasText: "Temporarily unavailable",
    })
  ).toBeVisible();
  await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    noindexPattern
  );
  await expect(
    publicPage.getByRole("button", { name: directContactPattern })
  ).toHaveCount(0);

  await proPage
    .getByLabel("Reason for unavailable or sold")
    .fill("Vehicle sale completed and inventory ownership has transferred.");
  await proPage.getByRole("button", { name: "Mark sold" }).click();
  await proPage
    .getByRole("alertdialog")
    .getByRole("button", { name: "Mark sold" })
    .click();
  await expect(proPage.getByText("Availability: Sold")).toBeVisible();

  const soldPageResponse = await publicPage.reload();
  expect(soldPageResponse?.status()).toBe(410);
  await expect(
    publicPage.getByText("Vehicle sold", { exact: true })
  ).toBeVisible();
  await expect(
    publicPage.getByRole("heading", {
      level: 1,
      name: vehicleListingFixture.reviewedTitle,
    })
  ).toBeVisible();
  await expect(publicPage.locator("img")).toHaveCount(0);
  await expect(publicPage.getByText("ZMW 735,000.00")).toHaveCount(0);
  await expect(
    publicPage.getByText("Marliket Journey Motors Limited")
  ).toHaveCount(0);
  await publicPage.setViewportSize({ height: 900, width: 320 });
  await expectNoHorizontalOverflow(publicPage);

  expect(proFailures).toEqual([]);
  expect(opsFailures).toEqual([]);
  expect(publicFailures).toEqual([
    "console: Failed to load resource: the server responded with a status of 410 (Gone)",
  ]);
  await Promise.all([
    proContext.close(),
    opsContext.close(),
    publicContext.close(),
  ]);
});
