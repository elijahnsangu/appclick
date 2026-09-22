import type { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import type { AppBindings } from "../types.js";

export function configureOpenAPI(app: OpenAPIHono<AppBindings>) {
  app.doc("/doc", {
    info: {
      description: "Cloudflare Worker API for Marliket.",
      title: "Marliket Server API",
      version: "0.1.0",
    },
    openapi: "3.0.0",
    servers: [
      {
        description: "Current origin",
        url: "/",
      },
    ],
  });

  app.get(
    "/reference",
    apiReference({
      defaultHttpClient: {
        clientKey: "fetch",
        targetKey: "js",
      },
      layout: "classic",
      spec: {
        url: "/doc",
      },
      theme: "kepler",
    })
  );
}
