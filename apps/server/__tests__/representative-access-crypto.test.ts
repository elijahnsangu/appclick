import { describe, expect, it, vi } from "vitest";
import {
  digestRepresentativeSecret,
  newRepresentativeInvitationToken,
  newRepresentativeOtp,
  representativeIdempotencyLockIdentity,
} from "../src/representatives/store.js";
import { createRepresentativeWhatsAppSender } from "../src/representatives/whatsapp.js";

const invitationTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const sha256HexPattern = /^[a-f0-9]{64}$/;

describe("representative access secrets", () => {
  it("creates a 256-bit URL-safe invitation token", () => {
    const token = newRepresentativeInvitationToken();

    expect(token).toMatch(invitationTokenPattern);
    expect(newRepresentativeInvitationToken()).not.toBe(token);
  });

  it("creates six-digit OTP values including leading zeroes", () => {
    const fill = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation((array) => {
        (array as Uint32Array)[0] = 42;
        return array;
      });

    expect(newRepresentativeOtp()).toBe("000042");
    fill.mockRestore();
  });

  it("uses a keyed, purpose-scoped digest", async () => {
    const invitation = await digestRepresentativeSecret({
      purpose: "invitation",
      secret: "test-secret-with-enough-entropy",
      value: "same-value",
    });
    const replay = await digestRepresentativeSecret({
      purpose: "invitation",
      secret: "test-secret-with-enough-entropy",
      value: "same-value",
    });
    const otp = await digestRepresentativeSecret({
      purpose: "step-up",
      secret: "test-secret-with-enough-entropy",
      value: "same-value",
    });

    expect(invitation).toMatch(sha256HexPattern);
    expect(replay).toBe(invitation);
    expect(otp).not.toBe(invitation);
  });

  it("creates an unambiguous identity for an idempotency lock", () => {
    expect(
      representativeIdempotencyLockIdentity({
        accountId: "account-a",
        idempotencyKey: "bc",
        operation: "d",
      })
    ).not.toBe(
      representativeIdempotencyLockIdentity({
        accountId: "account-ab",
        idempotencyKey: "c",
        operation: "d",
      })
    );
  });
});

describe("representative WhatsApp sender", () => {
  it("fails closed when no provider endpoint is configured", async () => {
    const sender = createRepresentativeWhatsAppSender({
      endpoint: undefined,
      fetch: vi.fn(),
    });

    await expect(
      sender.sendOtp({
        code: "123456",
        expiresAt: new Date("2026-08-04T12:10:00.000Z"),
        phone: "+260971234567",
        purpose: "REPRESENTATIVE_ACCESS_STEP_UP",
      })
    ).resolves.toEqual({ code: "UNAVAILABLE", sent: false });
  });

  it("posts the bounded OTP payload and bearer credential", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const sender = createRepresentativeWhatsAppSender({
      authToken: "provider-secret",
      endpoint: "https://whatsapp.example.test/otp",
      fetch,
    });

    await expect(
      sender.sendOtp({
        code: "123456",
        expiresAt: new Date("2026-08-04T12:10:00.000Z"),
        phone: "+260971234567",
        purpose: "REPRESENTATIVE_ACCESS_STEP_UP",
      })
    ).resolves.toEqual({ sent: true });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://whatsapp.example.test/otp",
      expect.objectContaining({
        body: JSON.stringify({
          code: "123456",
          expiresAt: "2026-08-04T12:10:00.000Z",
          phone: "+260971234567",
          purpose: "REPRESENTATIVE_ACCESS_STEP_UP",
        }),
        headers: {
          authorization: "Bearer provider-secret",
          "content-type": "application/json",
        },
        method: "POST",
      })
    );
  });

  it("fails closed on provider rejection", async () => {
    const sender = createRepresentativeWhatsAppSender({
      endpoint: "https://whatsapp.example.test/otp",
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    });

    await expect(
      sender.sendOtp({
        code: "123456",
        expiresAt: new Date("2026-08-04T12:10:00.000Z"),
        phone: "+260971234567",
        purpose: "REPRESENTATIVE_ACCESS_STEP_UP",
      })
    ).resolves.toEqual({ code: "UNAVAILABLE", sent: false });
  });
});
