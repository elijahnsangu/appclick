import { startLocalNeonWebSocketBridge } from "./local-neon-websocket-bridge.ts";

type StartBridge = typeof startLocalNeonWebSocketBridge;

const loopbackHosts = new Set(["127.0.0.1", "localhost"]);

export async function prepareWorkerDatabaseTransport(
  databaseUrlValue: string,
  startBridge: StartBridge = startLocalNeonWebSocketBridge
) {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    // biome-ignore lint/style/useErrorCause: The URL input and parser cause may contain credentials.
    throw new Error("The E2E database URL is invalid.");
  }
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    return {
      close: () => Promise.resolve(),
      databaseUrlValue,
      wranglerVars: ["DATABASE_TRANSPORT:neon"],
    } as const;
  }

  const bridge = await startBridge({
    databaseHost: databaseUrl.hostname,
    databasePort: Number(databaseUrl.port || "5432"),
    port: 0,
  });
  return {
    close: bridge.close,
    databaseUrlValue: databaseUrl.href,
    wranglerVars: [
      "DATABASE_TRANSPORT:local-websocket",
      `LOCAL_DATABASE_WEBSOCKET_PROXY:${bridge.address}`,
    ],
  } as const;
}
