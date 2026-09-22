/** A structured failure surfaced to the UI, carrying the server's error code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number, cause?: unknown) {
    super(message, { cause });
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}
