export interface RepresentativeOtpMessage {
  code: string;
  expiresAt: Date;
  phone: string;
  purpose: "REPRESENTATIVE_ACCESS_STEP_UP";
}

export type RepresentativeOtpDeliveryResult =
  | { sent: true }
  | { code: "UNAVAILABLE"; sent: false };

export interface RepresentativeWhatsAppSender {
  sendOtp: (
    message: RepresentativeOtpMessage
  ) => Promise<RepresentativeOtpDeliveryResult>;
}

export interface RepresentativeWhatsAppSenderConfig {
  authToken?: string;
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export function createRepresentativeWhatsAppSender(
  config: RepresentativeWhatsAppSenderConfig
): RepresentativeWhatsAppSender {
  return {
    async sendOtp(message) {
      if (!config.endpoint) {
        return { code: "UNAVAILABLE", sent: false };
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.timeoutMs ?? 5000
      );
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (config.authToken) {
          headers.authorization = `Bearer ${config.authToken}`;
        }
        const response = await (config.fetch ?? globalThis.fetch)(
          config.endpoint,
          {
            body: JSON.stringify({
              code: message.code,
              expiresAt: message.expiresAt.toISOString(),
              phone: message.phone,
              purpose: message.purpose,
            }),
            headers,
            method: "POST",
            signal: controller.signal,
          }
        );
        return response.ok
          ? { sent: true }
          : { code: "UNAVAILABLE", sent: false };
      } catch {
        return { code: "UNAVAILABLE", sent: false };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
