import { ApiError } from "./error";

/** The server wraps every response in this envelope (`stoker` successSchema). */
export type Envelope<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: { code: string; message: string }; requestId: string };

interface EnvelopeResponse<T> {
  json: () => Promise<Envelope<T>>;
  status: number;
}

/**
 * Bridges a Hono RPC response (or any `{ json, status }`) to the unwrapped
 * `data`. Throws `ApiError` on network failure, unparseable bodies, or an
 * `ok:false` envelope — matching the copy used across apps/pro.
 */
export async function unwrap<T>(
  input: Promise<EnvelopeResponse<T>> | EnvelopeResponse<T>
): Promise<T> {
  let res: EnvelopeResponse<T>;
  try {
    res = await input;
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: ApiError forwards `cause` to Error via its constructor (super(message, { cause })).
    throw new ApiError(
      "NETWORK",
      "We couldn't reach Marliket. Check your connection and try again.",
      0,
      error
    );
  }

  const body = await res.json().catch(() => null);

  if (!body) {
    throw new ApiError(
      "UNKNOWN",
      "Something went wrong on our end. Please try again.",
      res.status
    );
  }
  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, res.status);
  }
  return body.data;
}
