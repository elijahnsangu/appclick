/*
 * This file configures the initialization of Sentry for edge runtime.
 * The config you add here will be used whenever a page or API route is loaded in an edge runtime.
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

// biome-ignore lint/performance/noNamespaceImport: Sentry SDK convention
import * as Sentry from "@sentry/nextjs";
import { createSentryOptions } from "./configuration";
import { keys } from "./keys";

export const initializeSentry = (): ReturnType<typeof Sentry.init> =>
  Sentry.init(createSentryOptions(keys().NEXT_PUBLIC_SENTRY_DSN));
