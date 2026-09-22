import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

interface Suite {
  readonly config: string;
  readonly databasePrefix: string;
  readonly databaseUrl: string | undefined;
  readonly name: string;
}

function requireSuiteDatabase(suite: Suite) {
  if (!suite.databaseUrl) {
    throw new Error(`${suite.name} E2E database configuration is required.`);
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(
      new URL(suite.databaseUrl).pathname.slice(1)
    );
  } catch {
    // biome-ignore lint/style/useErrorCause: The URL input and parser cause may contain credentials.
    throw new Error(`${suite.name} E2E database configuration is invalid.`);
  }
  if (!databaseName.startsWith(suite.databasePrefix)) {
    throw new Error(
      `${suite.name} E2E requires a ${suite.databasePrefix}* database.`
    );
  }
  return suite.databaseUrl;
}

function childEnvironment(databaseUrl: string) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          key !== "BUSINESS_AUTHORITY_E2E_DATABASE_URL" &&
          key !== "MARKETPLACE_ROLE_E2E_DATABASE_URL" &&
          key !== "REPRESENTATIVE_ACCESS_E2E_DATABASE_URL" &&
          key !== "VEHICLE_LISTING_E2E_DATABASE_URL" &&
          key !== "VEHICLE_DISCOVERY_E2E_DATABASE_URL"
      )
    ),
    DATABASE_URL: databaseUrl,
  };
}

async function runSuite(suite: Suite) {
  const databaseUrl = requireSuiteDatabase(suite);
  await new Promise<void>((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(
      command,
      ["exec", "playwright", "test", "--config", suite.config],
      {
        env: childEnvironment(databaseUrl),
        stdio: "inherit",
      }
    );
    child.once("error", () =>
      reject(new Error(`${suite.name} E2E could not be started.`))
    );
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${suite.name} E2E failed.`));
      }
    });
  });
}

export async function runAllE2e(
  environment: NodeJS.ProcessEnv = process.env,
  planOnly = false
) {
  const suites: Suite[] = [
    {
      config: "playwright.business-authority.config.ts",
      databasePrefix: "marliket_issue44_e2e_",
      databaseUrl: environment.BUSINESS_AUTHORITY_E2E_DATABASE_URL,
      name: "Business Authority",
    },
    {
      config: "playwright.marketplace-roles.config.ts",
      databasePrefix: "marliket_issue46_e2e_",
      databaseUrl: environment.MARKETPLACE_ROLE_E2E_DATABASE_URL,
      name: "Marketplace Roles",
    },
    {
      config: "playwright.representative-access.config.ts",
      databasePrefix: "marliket_issue45_e2e_",
      databaseUrl: environment.REPRESENTATIVE_ACCESS_E2E_DATABASE_URL,
      name: "Representative Access",
    },
    {
      config: "playwright.vehicle-listing.config.ts",
      databasePrefix: "marliket_issue47_e2e_",
      databaseUrl: environment.VEHICLE_LISTING_E2E_DATABASE_URL,
      name: "Vehicle Listing",
    },
    {
      config: "playwright.vehicle-discovery.config.ts",
      databasePrefix: "marliket_issue48_e2e_",
      databaseUrl: environment.VEHICLE_DISCOVERY_E2E_DATABASE_URL,
      name: "Vehicle Discovery",
    },
  ];
  for (const suite of suites) {
    requireSuiteDatabase(suite);
  }
  if (planOnly) {
    for (const suite of suites) {
      console.log(`${suite.name}: ${suite.config}`);
    }
    return;
  }
  await suites.reduce(async (previous, suite) => {
    await previous;
    await runSuite(suite);
  }, Promise.resolve());
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  await runAllE2e(process.env, process.argv.includes("--plan"));
}
