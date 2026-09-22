import { createConnection, type Socket } from "node:net";
import { type RawData, WebSocket, WebSocketServer } from "ws";

interface LocalNeonWebSocketBridgeOptions {
  readonly databaseHost: string;
  readonly databasePort: number;
  readonly port: number;
}

export interface LocalNeonWebSocketBridge {
  readonly address: string;
  close: () => Promise<void>;
}

function expectedAddress(options: LocalNeonWebSocketBridgeOptions) {
  return `${options.databaseHost}:${options.databasePort}`;
}

function rawDataToBuffer(data: RawData) {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

export async function startLocalNeonWebSocketBridge(
  options: LocalNeonWebSocketBridgeOptions
): Promise<LocalNeonWebSocketBridge> {
  if (
    options.databaseHost !== "127.0.0.1" &&
    options.databaseHost !== "localhost"
  ) {
    throw new Error(
      "The E2E database bridge only permits a loopback PostgreSQL target."
    );
  }

  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: options.port,
  });
  const sockets = new Set<Socket>();
  const webSockets = new Set<WebSocket>();
  let closePromise: Promise<void> | undefined;

  server.on("connection", (webSocket, request) => {
    const requestUrl = new URL(request.url ?? "/", "ws://127.0.0.1");
    if (
      requestUrl.pathname !== "/v1" ||
      requestUrl.searchParams.get("address") !== expectedAddress(options)
    ) {
      webSocket.close(1008, "Unexpected PostgreSQL target");
      return;
    }

    const socket = createConnection({
      host: options.databaseHost,
      port: options.databasePort,
    });
    sockets.add(socket);
    webSockets.add(webSocket);

    webSocket.on("message", (data) => {
      if (!socket.destroyed) {
        socket.write(rawDataToBuffer(data));
      }
    });
    socket.on("data", (data) => {
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(data, { binary: true });
      }
    });
    socket.on("error", () => {
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.close(1011, "PostgreSQL connection failed");
      }
    });
    socket.on("close", () => {
      sockets.delete(socket);
      if (
        webSocket.readyState === WebSocket.OPEN ||
        webSocket.readyState === WebSocket.CONNECTING
      ) {
        webSocket.close();
      }
    });
    webSocket.on("close", () => {
      webSockets.delete(webSocket);
      socket.destroy();
    });
    webSocket.on("error", () => {
      socket.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const boundAddress = server.address();
  const boundPort =
    typeof boundAddress === "object" && boundAddress
      ? boundAddress.port
      : options.port;

  return {
    address: `127.0.0.1:${boundPort}`,
    close: () => {
      closePromise ??= (async () => {
        for (const webSocket of webSockets) {
          webSocket.terminate();
        }
        for (const socket of sockets) {
          socket.destroy();
        }
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      })();
      return closePromise;
    },
  };
}
