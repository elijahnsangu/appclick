import { fileURLToPath } from "node:url";
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";
import {
  vehicleDiscoveryClock,
  vehicleDiscoveryFixture,
  vehicleDiscoveryMediaOrigin,
  vehicleDiscoveryReferences,
} from "./fixtures/vehicle-discovery.ts";
import {
  type FocusIndicatorStyle,
  hasVisibleFocusDifference,
} from "./helpers/focus-indicator.ts";
import { apiOrigin, webOrigin } from "./helpers/origins.ts";
import {
  openVehicleDiscoveryE2eDatabase,
  resetVehicleDiscoveryScenario,
  seedVehicleDiscoveryScenario,
} from "./helpers/vehicle-discovery-database.ts";

const canonicalHomePattern = /\/en$/;
const canonicalVehiclesPattern = /\/en\/vehicles(?:\?.*)?$/;
const canonicalVehiclesWithoutQueryPattern = /\/en\/vehicles$/;
const conditionUsedPattern = /condition=USED/;
const corollaReferencePattern = /^Corolla \d+ vehicles$/;
const corollaQueryPattern = /q=Corolla/;
const directCorollaQueryPattern = /\/en\/vehicles\?q=corolla$/;
const noindexPattern = /noindex/i;
const priceSortPattern = /sort=PRICE_ASC/;
const searchUnavailablePattern = /Suggestions are temporarily unavailable/i;
const vehicleCardLinkPattern = /^View /;
const vehicleModelYear2018Pattern = /^View 2018 /;
const vehicleModelYear2024Pattern = /^View 2024 /;
const vehiclePageTwoPattern = /\/en\/vehicles\?page=2$/;
const vehicleDiscoveryMediaFixturePath = fileURLToPath(
  new URL("./fixtures/e2e-vehicle.svg", import.meta.url)
);
const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeZone: "Africa/Lusaka",
});

type Sql = Awaited<ReturnType<typeof openVehicleDiscoveryE2eDatabase>>;
let sql: Sql | undefined;

test.describe.configure({ mode: "serial", retries: 0, timeout: 300_000 });

test.beforeAll(async () => {
  sql = await openVehicleDiscoveryE2eDatabase();
  await resetVehicleDiscoveryScenario(sql);
  await seedVehicleDiscoveryScenario(sql);
});

test.afterAll(async () => {
  if (sql) {
    await resetVehicleDiscoveryScenario(sql);
    await sql.end();
  }
});

test.beforeEach(async ({ context }) => {
  await installVehicleDiscoveryMediaFixture(context);
  await context.route("https://va.vercel-scripts.com/**", (route) =>
    route.fulfill({ status: 204 })
  );
});

async function installVehicleDiscoveryMediaFixture(context: BrowserContext) {
  await context.route(
    `${vehicleDiscoveryMediaOrigin}/e2e-vehicle.svg**`,
    async (route) => {
      await route.fulfill({
        contentType: "image/svg+xml",
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=31536000, immutable",
          "cross-origin-resource-policy": "cross-origin",
        },
        path: vehicleDiscoveryMediaFixturePath,
      });
    }
  );
}

function isMobile(testInfo: TestInfo): boolean {
  return testInfo.project.name === "chromium-mobile";
}

async function filterSurface(page: Page, testInfo: TestInfo): Promise<Locator> {
  if (isMobile(testInfo)) {
    await page.getByRole("button", { name: "Filters" }).click();
    return page.getByRole("dialog", { name: "Filter vehicles" });
  }
  return page.getByRole("complementary", { name: "Vehicle filters" });
}

async function closeMobileFilterSurface(page: Page, testInfo: TestInfo) {
  if (isMobile(testInfo)) {
    await page.getByRole("button", { name: "Close" }).click();
  }
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

async function expectStickySurfaceBelowHeader(page: Page, surface: Locator) {
  await page.evaluate(() =>
    window.scrollTo({ behavior: "instant", top: document.body.scrollHeight })
  );
  await expect
    .poll(async () => {
      const [headerBounds, surfaceBounds] = await Promise.all([
        page.locator("header").first().boundingBox(),
        surface.boundingBox(),
      ]);
      return (
        headerBounds !== null &&
        surfaceBounds !== null &&
        surfaceBounds.y >= headerBounds.y + headerBounds.height
      );
    })
    .toBe(true);
}

async function expectMinimumTouchTarget(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
}

async function expectEveryFormControlLabelled(scope: Locator) {
  const unlabelled = await scope
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

async function expectFocusedFilterControlsClearStickyActions(scope: Locator) {
  const controls = scope.locator(
    "input:not([disabled]), select:not([disabled])"
  );
  const stickyActions = scope
    .getByRole("button", { name: "Show results" })
    .locator("..");
  const controlCount = await controls.count();

  for (let index = 0; index < controlCount; index += 1) {
    const control = controls.nth(index);
    // biome-ignore lint/performance/noAwaitInLoops: Focus and geometry assertions must run in browser order.
    await control.focus();
    await expect(control).toBeFocused();
    await expect
      .poll(async () => {
        const [controlBounds, actionBounds] = await Promise.all([
          control.boundingBox(),
          stickyActions.boundingBox(),
        ]);
        return (
          controlBounds !== null &&
          actionBounds !== null &&
          controlBounds.y + controlBounds.height <= actionBounds.y
        );
      })
      .toBe(true);
  }
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

async function expectNoPrivateFixtureFacts(page: Page) {
  const content = await page.locator("body").innerText();
  expect(content).not.toContain("Private E2E address");
  expect(content).not.toContain("private-");
  expect(content).not.toContain("+260971234567");
  expect(content).not.toContain("ISSUE48CHASSIS");
  expect(content).not.toContain("Review Evidence");
}

async function expectNoindex(page: Page) {
  const robots = page.locator('meta[name="robots"]');
  await expect(robots.first()).toHaveAttribute("content", noindexPattern);
  const count = await robots.count();
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      expect(robots.nth(index)).toHaveAttribute("content", noindexPattern)
    )
  );
}

async function visibleVehicleCohort(page: Page): Promise<string[]> {
  return await page
    .getByRole("link", { name: vehicleCardLinkPattern })
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("aria-label") ?? "")
    );
}

async function expectFirstVehicle(page: Page, accessibleName: RegExp | string) {
  await expect(
    page.getByRole("link", { name: vehicleCardLinkPattern }).first()
  ).toHaveAccessibleName(accessibleName);
}

async function selectSortAndExpectFirstVehicle(
  page: Page,
  sortValue:
    | "FRESHNESS_DESC"
    | "MODEL_YEAR_ASC"
    | "MODEL_YEAR_DESC"
    | "ODOMETER_ASC"
    | "ODOMETER_DESC"
    | "PRICE_ASC"
    | "PRICE_DESC",
  accessibleName: RegExp | string
) {
  await page
    .getByRole("combobox", { name: "Sort vehicles" })
    .selectOption(sortValue);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("sort"))
    .toBe(sortValue === "FRESHNESS_DESC" ? null : sortValue);
  await expectFirstVehicle(page, accessibleName);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo({ behavior: "instant", top: 0 }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    animations: "disabled",
    caret: "initial",
    fullPage: true,
    path: testInfo.outputPath(`${name}.png`),
    style: "nextjs-portal { display: none !important; }",
  });
}

test("enters from home, searches by keyboard, restores URL state, and follows the reviewed Business journey", async ({
  context,
  page,
  request,
}, testInfo) => {
  const failures = watchBrowserFailures(page);
  const unprefixed = await request.get("/vehicles", { maxRedirects: 0 });
  expect(unprefixed.status()).toBe(308);
  expect(unprefixed.headers().location).toMatch(
    canonicalVehiclesWithoutQueryPattern
  );
  const untranslated = await request.get("/es/vehicles", {
    maxRedirects: 0,
  });
  expect(untranslated.status()).toBe(308);
  expect(untranslated.headers().location).toMatch(
    canonicalVehiclesWithoutQueryPattern
  );

  await page.goto("/");
  await expect(page).toHaveURL(canonicalHomePattern);
  await capture(page, testInfo, "home");

  const search = page
    .locator("main")
    .getByRole("combobox", { name: "Search marketplace vehicles" });
  await search.fill("corolla");
  const corollaReference = page.getByRole("option", {
    name: corollaReferencePattern,
  });
  await expect(corollaReference).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(canonicalVehiclesPattern);
  await expect(page).toHaveURL(corollaQueryPattern);
  await expect(page.getByText("12 vehicles", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Sort vehicles" })
  ).toHaveValue("RELEVANCE");

  const filters = await filterSurface(page, testInfo);
  await filters.getByRole("checkbox", { name: "Used" }).check();
  await filters.getByRole("button", { name: "Show results" }).click();
  await expect(page).toHaveURL(conditionUsedPattern);
  await expect(page).toHaveURL(corollaQueryPattern);
  await expect(
    page.getByRole("link", {
      name: `View ${vehicleDiscoveryFixture.mainTitle}`,
    })
  ).toBeVisible();
  await capture(page, testInfo, "active-filters");

  const sort = page.getByRole("combobox", { name: "Sort vehicles" });
  await sort.selectOption("PRICE_ASC");
  await expect(page).toHaveURL(priceSortPattern);
  await expectFirstVehicle(page, "View 2023 Toyota Corolla 02");
  const copiedUrl = page.url();
  await page.goBack();
  await expect(page).not.toHaveURL(priceSortPattern);
  await page.goForward();
  await expect(page).toHaveURL(priceSortPattern);

  const copiedPage = await context.newPage();
  await copiedPage.goto(copiedUrl);
  await expect(copiedPage).toHaveURL(copiedUrl);
  await expect(
    copiedPage.getByRole("link", {
      name: `View ${vehicleDiscoveryFixture.mainTitle}`,
    })
  ).toBeVisible();
  await copiedPage.close();

  const discoveryUrl = page.url();
  const discoveryCohort = await visibleVehicleCohort(page);
  const selectedVehicle = page.getByRole("link", {
    name: `View ${vehicleDiscoveryFixture.mainTitle}`,
  });
  await selectedVehicle.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy({ behavior: "instant", top: 160 }));
  const discoveryScrollY = await page.evaluate(() => window.scrollY);
  expect(discoveryScrollY).toBeGreaterThan(0);

  await selectedVehicle.click();
  await expect(page).toHaveURL(
    `/en${vehicleDiscoveryFixture.vehicleCanonicalPath}`
  );
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Related Vehicles",
    })
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Related Vehicles" })
      .getByRole("link", { name: vehicleCardLinkPattern })
      .first()
  ).toBeVisible();
  await expectNoPrivateFixtureFacts(page);
  await expectMinimumTouchTarget(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", {
      name: "Marketplace",
    })
  );
  await expectMinimumTouchTarget(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", {
      name: "Vehicles",
    })
  );
  await expectMinimumTouchTarget(
    page
      .getByRole("region", { name: "Related Vehicles" })
      .getByRole("link", { name: vehicleDiscoveryFixture.businessPublicName })
      .first()
  );
  if (!isMobile(testInfo)) {
    await expectStickySurfaceBelowHeader(
      page,
      page
        .getByText("Asking price", { exact: true })
        .locator("xpath=ancestor::aside")
    );
  }
  await capture(page, testInfo, "vehicle-detail");

  await page.goBack();
  await expect(page).toHaveURL(discoveryUrl);
  await expect.poll(() => visibleVehicleCohort(page)).toEqual(discoveryCohort);
  await expect
    .poll(
      async () =>
        Math.abs(
          (await page.evaluate(() => window.scrollY)) - discoveryScrollY
        ) <= 8
    )
    .toBe(true);
  if (isMobile(testInfo)) {
    await page
      .getByRole("button", { name: "Search marketplace vehicles" })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Search marketplace vehicles" })
    ).toHaveValue("Corolla");
    await page.keyboard.press("Escape");
  } else {
    await expect(
      page.getByRole("combobox", { name: "Search vehicles" })
    ).toHaveValue("Corolla");
  }

  await page
    .getByRole("link", { name: `View ${vehicleDiscoveryFixture.mainTitle}` })
    .click();
  await expect(page).toHaveURL(
    `/en${vehicleDiscoveryFixture.vehicleCanonicalPath}`
  );

  await page.goto(
    `/en${vehicleDiscoveryFixture.vehicleCanonicalPath}?currency=USD`
  );
  await expect(
    page.getByText(
      "USD estimates are currently unavailable. Prices and filters are shown in authoritative ZMW."
    )
  ).toBeVisible();
  await expect(page).toHaveURL(
    `/en${vehicleDiscoveryFixture.vehicleCanonicalPath}`
  );

  await page
    .getByRole("link", { name: vehicleDiscoveryFixture.businessPublicName })
    .first()
    .click();
  await expect(page).toHaveURL(
    `/en${vehicleDiscoveryFixture.businessCanonicalPath}`
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: vehicleDiscoveryFixture.businessPublicName,
    })
  ).toBeVisible();
  await expect(
    page
      .getByText("Registration checked", { exact: true })
      .locator("..")
      .getByText(
        dateFormatter.format(vehicleDiscoveryClock.registrationCheckedAt),
        { exact: true }
      )
  ).toBeVisible();
  await expect(
    page
      .getByText("Contact checked", { exact: true })
      .locator("..")
      .getByText(dateFormatter.format(vehicleDiscoveryClock.contactCheckedAt), {
        exact: true,
      })
  ).toBeVisible();
  await expectNoPrivateFixtureFacts(page);
  await capture(page, testInfo, "business-profile");

  await page.goto(
    `/en${vehicleDiscoveryFixture.businessCanonicalPath}?currency=USD&page=2`
  );
  await expect(
    page.getByText(
      "USD estimates are currently unavailable. Prices and filters are shown in authoritative ZMW."
    )
  ).toBeVisible();
  await expect(page).toHaveURL(
    `/en${vehicleDiscoveryFixture.businessCanonicalPath}?page=2`
  );
  expect(failures).toEqual([]);
});

test("restores every reviewed filter, canonicalizes malformed state, paginates, and falls back from USD", async ({
  page,
}, testInfo) => {
  const failures = watchBrowserFailures(page);
  const allFilters = new URLSearchParams({
    bodyType: "SEDAN",
    condition: "USED",
    drivetrain: "FWD",
    fuelOrEnergy: "HYBRID",
    locality: "Kabulonga",
    make: vehicleDiscoveryReferences.toyota.id,
    modelFamily: vehicleDiscoveryReferences.toyota.models.corolla.id,
    odometerMax: "50000",
    odometerUnit: "KILOMETRES",
    priceMaxMinor: "53000000",
    priceMinMinor: "50000000",
    province: "Lusaka",
    transmission: "MANUAL",
    yearMax: "2022",
    yearMin: "2022",
  });
  await page.goto(`/en/vehicles?${allFilters}`);
  await expect(page.getByText("1 vehicle", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `View ${vehicleDiscoveryFixture.mainTitle}`,
    })
  ).toBeVisible();

  const filters = await filterSurface(page, testInfo);
  await expect(filters.getByRole("combobox", { name: "Province" })).toHaveValue(
    "Lusaka"
  );
  await expect(filters.getByRole("combobox", { name: "Locality" })).toHaveValue(
    "Kabulonga"
  );
  await expect(
    filters.getByRole("checkbox", { exact: true, name: "Toyota" })
  ).toBeChecked();
  await expect(
    filters.getByRole("checkbox", { name: "Toyota Corolla" })
  ).toBeChecked();
  await expect(filters.getByRole("checkbox", { name: "Used" })).toBeChecked();
  await expect(filters.getByRole("checkbox", { name: "Sedan" })).toBeChecked();
  await expect(filters.getByRole("checkbox", { name: "Hybrid" })).toBeChecked();
  await expect(filters.getByRole("checkbox", { name: "Manual" })).toBeChecked();
  await expect(filters.getByRole("checkbox", { name: "Fwd" })).toBeChecked();
  await expect(filters.getByLabel("Maximum odometer")).toHaveValue("50000");
  await expect(filters.getByLabel("Odometer unit")).toHaveValue("KILOMETRES");
  await expectEveryFormControlLabelled(filters);
  await closeMobileFilterSurface(page, testInfo);

  const restoredUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(restoredUrl);
  await expect(
    page.getByRole("link", {
      name: `View ${vehicleDiscoveryFixture.mainTitle}`,
    })
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove Toyota filter" }).click();
  await expect(page).not.toHaveURL(restoredUrl);
  const chipRemovedFilters = await filterSurface(page, testInfo);
  await expect(
    chipRemovedFilters.getByRole("checkbox", { exact: true, name: "Toyota" })
  ).not.toBeChecked();
  await closeMobileFilterSurface(page, testInfo);

  await page.goBack();
  await expect(page).toHaveURL(restoredUrl);
  const backRestoredFilters = await filterSurface(page, testInfo);
  await expect(
    backRestoredFilters.getByRole("checkbox", { exact: true, name: "Toyota" })
  ).toBeChecked();
  await closeMobileFilterSurface(page, testInfo);
  await page.goForward();
  await expect(page).not.toHaveURL(restoredUrl);

  await page.goto("/en/vehicles?bodyType=SUV&bodyType=SEDAN");
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("bodyType"))
    .toEqual(["SEDAN", "SUV"]);

  await page.goto(
    "/en/vehicles?yearMin=2024&yearMax=2020&page=0&locality=Kabulonga&sort=RELEVANCE&unknown=x"
  );
  await expect(page).toHaveURL(canonicalVehiclesWithoutQueryPattern);
  await expect(page.getByText("30 vehicles", { exact: true })).toBeVisible();

  await page.goto("/en/vehicles?currency=USD");
  await expect(
    page.getByText(
      "USD estimates are currently unavailable. Prices and filters are shown in authoritative ZMW."
    )
  ).toBeVisible();
  await expectNoindex(page);
  await expect(page).toHaveURL(canonicalVehiclesWithoutQueryPattern);

  await page.goto("/en/vehicles?currency=ZMW");
  await expectNoindex(page);
  await expect(page).toHaveURL(canonicalVehiclesWithoutQueryPattern);

  const standaloneModelFamilyUrl = `/en/vehicles?modelFamily=${vehicleDiscoveryReferences.toyota.models.corolla.id}`;
  await page.goto(standaloneModelFamilyUrl);
  await expect(page).toHaveURL(standaloneModelFamilyUrl);
  await expect(page.getByText("12 vehicles", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove Corolla filter" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `View ${vehicleDiscoveryFixture.mainTitle}`,
    })
  ).toBeVisible();
  await expectNoindex(page);

  await page.goto("/en/vehicles?q=no-such-reviewed-vehicle");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "No reviewed Vehicles match your current search",
    })
  ).toBeVisible();
  await expect(page.getByText("Broaden this Vehicle search")).toBeVisible();
  await expectNoindex(page);
  await capture(page, testInfo, "empty-results");

  await page.goto("/en/vehicles");
  await expectFirstVehicle(page, `View ${vehicleDiscoveryFixture.mainTitle}`);
  await selectSortAndExpectFirstVehicle(
    page,
    "PRICE_ASC",
    "View 2023 Toyota Corolla 02"
  );
  await selectSortAndExpectFirstVehicle(
    page,
    "PRICE_DESC",
    `View ${vehicleDiscoveryFixture.longLabelTitle}`
  );
  await selectSortAndExpectFirstVehicle(
    page,
    "MODEL_YEAR_DESC",
    vehicleModelYear2024Pattern
  );
  await selectSortAndExpectFirstVehicle(
    page,
    "MODEL_YEAR_ASC",
    vehicleModelYear2018Pattern
  );
  await selectSortAndExpectFirstVehicle(
    page,
    "ODOMETER_ASC",
    "View 2023 Toyota Corolla 02"
  );
  await selectSortAndExpectFirstVehicle(
    page,
    "ODOMETER_DESC",
    `View ${vehicleDiscoveryFixture.longLabelTitle}`
  );
  await selectSortAndExpectFirstVehicle(
    page,
    "FRESHNESS_DESC",
    `View ${vehicleDiscoveryFixture.mainTitle}`
  );
  await page.evaluate(() => {
    (
      window as Window & { vehicleDiscoveryNavigationMarker?: boolean }
    ).vehicleDiscoveryNavigationMarker = true;
  });
  await page
    .getByRole("navigation", { name: "Vehicle results pages" })
    .getByRole("link", { name: "Page 2" })
    .click();
  await expect(page).toHaveURL(vehiclePageTwoPattern);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { vehicleDiscoveryNavigationMarker?: boolean })
          .vehicleDiscoveryNavigationMarker
    )
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? null))
    .toBe("vehicle-results-heading");
  await expect(
    page
      .getByRole("navigation", { name: "Vehicle results pages" })
      .getByRole("link", { name: "Page 2" })
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: vehicleCardLinkPattern })
  ).toHaveCount(6);
  await expectNoindex(page);

  await page.goto("/en/vehicles?page=9");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "This results page is no longer available",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Go to page 2" })
  ).toBeVisible();
  expect(failures).toEqual([]);
});

test("rechecks eligibility, preserves unavailable and sold semantics, redirects canonical slugs, and redacts private facts", async ({
  page,
  request,
}, testInfo) => {
  const failures = watchBrowserFailures(page);
  const defaultResponse = await request.get(`${apiOrigin}/v1/public/vehicles`);
  expect(defaultResponse.status()).toBe(200);
  const defaultBody = await defaultResponse.text();
  expect(defaultBody).toContain('"totalItems":30');
  expect(defaultBody).not.toContain(vehicleDiscoveryFixture.staleListingId);
  expect(defaultBody).not.toContain(vehicleDiscoveryFixture.hiddenListingId);
  expect(defaultBody).not.toContain(
    vehicleDiscoveryFixture.mediaPendingListingId
  );
  expect(defaultBody).not.toContain("private-");
  expect(defaultBody).not.toContain("ISSUE48CHASSIS");

  const stale = await request.get(
    `${apiOrigin}/v1/public/vehicle-listings/${vehicleDiscoveryFixture.staleListingId}`
  );
  expect(stale.status()).toBe(404);
  const mediaPending = await request.get(
    `${apiOrigin}/v1/public/vehicle-listings/${vehicleDiscoveryFixture.mediaPendingListingId}`
  );
  expect(mediaPending.status()).toBe(404);
  const suspended = await request.get(
    `${apiOrigin}/v1/public/vehicle-listings/${vehicleDiscoveryFixture.hiddenListingId}`
  );
  expect(suspended.status()).toBe(404);
  const temporaryOnlyProfile = await request.get(
    `${apiOrigin}/v1/public/businesses/${vehicleDiscoveryFixture.temporaryOnlyBusinessId}?currency=ZMW&page=1`
  );
  expect(temporaryOnlyProfile.status()).toBe(200);
  expect(await temporaryOnlyProfile.json()).toMatchObject({
    data: {
      activeListings: {
        items: [],
        pagination: { totalItems: 0, totalPages: 0 },
      },
      indexing: { indexable: false, reason: "EMPTY_INVENTORY" },
      kind: "PUBLIC_BUSINESS_PROFILE",
    },
    ok: true,
  });
  await page.goto(`/en${vehicleDiscoveryFixture.temporaryOnlyBusinessPath}`);
  await expect(
    page.getByText(
      "This Business has no Vehicles currently available on Marliket"
    )
  ).toBeVisible();
  await expectNoindex(page);
  await expect(page.getByText("2021 Honda CR-V Reserved")).toHaveCount(0);

  const temporary = await request.get(
    `${apiOrigin}/v1/public/vehicle-listings/${vehicleDiscoveryFixture.temporaryListingId}`
  );
  expect(temporary.status()).toBe(200);
  await page.goto(
    `/en${vehicleDiscoveryFixture.temporaryVehicleCanonicalPath}`
  );
  const unavailableAlert = page
    .getByRole("alert")
    .filter({ hasText: "Temporarily unavailable" });
  await expect(
    unavailableAlert.getByText("Temporarily unavailable", { exact: true })
  ).toBeVisible();
  await expect(unavailableAlert).toContainText(
    "This vehicle is not accepting inquiries."
  );
  await expect(unavailableAlert).toContainText(
    "saved links have a clear, current status."
  );
  await expectNoindex(page);
  await expectNoPrivateFixtureFacts(page);

  const sold = await request.get(
    `${apiOrigin}/v1/public/vehicle-listings/${vehicleDiscoveryFixture.soldListingId}`
  );
  expect(sold.status()).toBe(410);
  const soldPageResponse = await page.goto(
    `/en${vehicleDiscoveryFixture.soldVehicleCanonicalPath}`
  );
  expect(soldPageResponse?.status()).toBe(410);
  await expect(page.getByText("Vehicle sold", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "2019 Ford Ranger Sold" })
  ).toBeVisible();
  await expectNoindex(page);
  await expectNoPrivateFixtureFacts(page);
  expect(failures).toEqual([
    "console: Failed to load resource: the server responded with a status of 410 (Gone)",
  ]);
  failures.length = 0;

  await page.goto(
    `/en/vehicles/not-canonical-${vehicleDiscoveryFixture.mainListingId}`
  );
  await expect(page).toHaveURL(
    `/en${vehicleDiscoveryFixture.vehicleCanonicalPath}`
  );
  await page.goto(
    `/en/businesses/not-canonical-${vehicleDiscoveryFixture.businessId}`
  );
  await expect(page).toHaveURL(
    `/en${vehicleDiscoveryFixture.businessCanonicalPath}`
  );
  await capture(page, testInfo, "canonical-business-profile");
  expect(failures).toEqual([]);
});

test("keeps failure recovery, accessibility, media, and reflow stable through mobile and narrow layouts", async ({
  page,
}, testInfo) => {
  const failures = watchBrowserFailures(page);
  await page.route(
    `${apiOrigin}/v1/public/discovery/suggestions**`,
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "PUBLIC_DISCOVERY_UNAVAILABLE",
            message: "Suggestions are temporarily unavailable.",
          },
          ok: false,
          requestId: "issue-48-suggestion-failure",
        }),
        contentType: "application/json",
        headers: {
          "access-control-allow-credentials": "true",
          "access-control-allow-origin": webOrigin,
        },
        status: 503,
      });
    }
  );
  await page.goto("/en");
  const search = page
    .locator("main")
    .getByRole("combobox", { name: "Search marketplace vehicles" });
  await search.fill("corolla");
  await expect(page.getByText(searchUnavailablePattern)).toBeVisible();
  await search.press("Enter");
  await expect(page).toHaveURL(directCorollaQueryPattern);
  await expect(
    page.getByRole("link", {
      name: `View ${vehicleDiscoveryFixture.mainTitle}`,
    })
  ).toBeVisible();
  await page.unroute(`${apiOrigin}/v1/public/discovery/suggestions**`);
  expect(failures).toEqual([
    "console: Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
  ]);
  failures.length = 0;

  await page.goto("/en/vehicles");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText("30 vehicles", { exact: true })).toHaveAttribute(
    "aria-live",
    "polite"
  );
  const filters = await filterSurface(page, testInfo);
  await expectEveryFormControlLabelled(filters);
  await closeMobileFilterSurface(page, testInfo);

  const searchButton = page
    .locator("header")
    .getByRole("button", { name: "Search marketplace vehicles" });
  if (isMobile(testInfo)) {
    await expectVisibleKeyboardFocus(searchButton);
  } else {
    await expectVisibleKeyboardFocus(
      page.locator("header").getByRole("button", { name: "Search vehicles" })
    );
  }

  const visibleImages = page.locator("img:visible");
  await expect(visibleImages.first()).toBeVisible();
  const firstVehicleImage = page
    .getByRole("link", { name: vehicleCardLinkPattern })
    .first()
    .getByRole("img");
  expect(await firstVehicleImage.getAttribute("src")).toContain(
    vehicleDiscoveryMediaOrigin
  );
  const missingAlternatives = await visibleImages.evaluateAll((images) =>
    images
      .filter((image) => !(image.getAttribute("alt") ?? "").trim())
      .map((image) => image.outerHTML)
  );
  expect(missingAlternatives).toEqual([]);
  const heroBounds = await visibleImages.first().boundingBox();
  expect(heroBounds?.width ?? 0).toBeGreaterThan(0);
  expect(heroBounds?.height ?? 0).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);
  const stickySurface = isMobile(testInfo)
    ? page
        .getByRole("combobox", { name: "Sort vehicles" })
        .locator("xpath=ancestor::div[contains(@class, 'sticky')][1]")
    : page.locator('aside[aria-label="Vehicle filters"]');
  await expectStickySurfaceBelowHeader(page, stickySurface);
  await page.evaluate(() => window.scrollTo({ behavior: "instant", top: 0 }));

  await page.setViewportSize({ height: 900, width: 1024 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ height: 900, width: 768 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ height: 900, width: 720 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ height: 844, width: 375 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ height: 900, width: 320 });
  await page.goto("/en/vehicles?page=2");
  await expect(
    page.getByRole("link", {
      name: `View ${vehicleDiscoveryFixture.longLabelTitle}`,
    })
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const narrowFilterTrigger = page.getByRole("button", { name: "Filters" });
  await narrowFilterTrigger.click();
  await expectFocusedFilterControlsClearStickyActions(
    page.getByRole("dialog", { name: "Filter vehicles" })
  );
  await page.keyboard.press("Escape");
  await expect(narrowFilterTrigger).toBeFocused();
  await page.setViewportSize({ height: 900, width: 1024 });
  const chromeSession = await page.context().newCDPSession(page);
  await chromeSession.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 2,
    height: 450,
    mobile: false,
    screenHeight: 900,
    screenWidth: 1024,
    width: 512,
  });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await chromeSession.send("Emulation.clearDeviceMetricsOverride");
  await page.setViewportSize({ height: 900, width: 1024 });
  await capture(page, testInfo, "narrow-long-label");
  expect(failures).toEqual([]);
});
