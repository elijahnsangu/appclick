import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { prepareWorkerDatabaseTransport } from "./worker-database-transport.ts";

const execFileAsync = promisify(execFile);

describe("Worker database transport", () => {
  it("loads through the native Node TypeScript runner used by Playwright", async () => {
    const moduleUrl = new URL("./worker-database-transport.ts", import.meta.url)
      .href;

    await expect(
      execFileAsync(process.execPath, [
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(moduleUrl)})`,
      ])
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("sanitizes malformed database URL errors", async () => {
    const credentialSentinel = "transport-password-sentinel";
    let inspectedError = "";

    try {
      await prepareWorkerDatabaseTransport(
        `postgresql://user:${credentialSentinel}@[invalid`
      );
    } catch (error) {
      inspectedError = JSON.stringify(
        error,
        error instanceof Error ? Object.getOwnPropertyNames(error) : undefined
      );
    }

    expect(inspectedError.length).toBeGreaterThan(0);
    expect(inspectedError.includes(credentialSentinel)).toBe(false);
  });

  it("uses native Worker transport for remote Neon", async () => {
    const startBridge = vi.fn();

    const transport = await prepareWorkerDatabaseTransport(
      "postgresql://user:password@ep-example-pooler.c-4.eu-central-1.aws.neon.tech/marliket_issue46_e2e_test?sslmode=require",
      startBridge
    );

    expect(startBridge).not.toHaveBeenCalled();
    expect(transport.databaseUrlValue).toBe(
      "postgresql://user:password@ep-example-pooler.c-4.eu-central-1.aws.neon.tech/marliket_issue46_e2e_test?sslmode=require"
    );
    expect(transport.wranglerVars).toEqual(["DATABASE_TRANSPORT:neon"]);
    await transport.close();
  });

  it("leaves unsupported remote database hosts on native transport", async () => {
    const startBridge = vi.fn();
    const databaseUrlValue =
      "postgresql://user:password@database.example.test/marliket_issue46_e2e_test";

    const transport = await prepareWorkerDatabaseTransport(
      databaseUrlValue,
      startBridge
    );

    expect(startBridge).not.toHaveBeenCalled();
    expect(transport.databaseUrlValue).toBe(databaseUrlValue);
    expect(transport.wranglerVars).toEqual(["DATABASE_TRANSPORT:neon"]);
    await expect(transport.close()).resolves.toBeUndefined();
  });

  it("keeps the supervised local bridge for a loopback database URL", async () => {
    const close = vi.fn(() => Promise.resolve());
    const startBridge = vi.fn(() =>
      Promise.resolve({ address: "127.0.0.1:52144", close })
    );

    const transport = await prepareWorkerDatabaseTransport(
      "postgresql://user:password@127.0.0.1:55446/marliket_issue46_e2e_test",
      startBridge
    );

    expect(startBridge).toHaveBeenCalledWith({
      databaseHost: "127.0.0.1",
      databasePort: 55_446,
      port: 0,
    });
    expect(transport.wranglerVars).toEqual([
      "DATABASE_TRANSPORT:local-websocket",
      "LOCAL_DATABASE_WEBSOCKET_PROXY:127.0.0.1:52144",
    ]);
    expect(transport.databaseUrlValue).toBe(
      "postgresql://user:password@127.0.0.1:55446/marliket_issue46_e2e_test"
    );
    await transport.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
