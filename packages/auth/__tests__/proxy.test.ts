import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { authMiddleware } from "../proxy";

const passthrough = () => new NextResponse("ok", { status: 200 });

const makeRequest = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });

describe("authMiddleware", () => {
  it("redirects unauthenticated requests on protected paths to /sign-in", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(makeRequest("/"), {} as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?redirect=%2F"
    );
  });

  it("carries the original destination in the redirect param", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(
      makeRequest("/settings/profile"),
      {} as never
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?redirect=%2Fsettings%2Fprofile"
    );
  });

  it("lets unauthenticated requests through on public paths", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(makeRequest("/sign-in"), {} as never);

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.status).toBe(200);
  });

  it("treats the auth API routes as public", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(
      makeRequest("/api/auth/callback/google"),
      {} as never
    );

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.status).toBe(200);
  });

  it("lets a Representative Invitation be inspected before sign-in", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(
      makeRequest("/representative-invitations/secure-token"),
      {} as never
    );

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.status).toBe(200);
  });

  it("lets requests with a session cookie through", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(
      makeRequest("/", "better-auth.session_token=abc"),
      {} as never
    );

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.status).toBe(200);
  });

  it("lets requests with a __Secure- prefixed session cookie through", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(
      makeRequest("/", "__Secure-better-auth.session_token=abc"),
      {} as never
    );

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.status).toBe(200);
  });

  it("lets /.well-known paths through without a cookie", async () => {
    const middleware = authMiddleware(passthrough);
    const response = await middleware(
      makeRequest("/.well-known/vercel/flags"),
      {} as never
    );

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.status).toBe(200);
  });
});
