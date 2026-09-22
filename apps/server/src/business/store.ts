import type { BusinessAuthoritySubmission } from "@repo/business";
import { sha256 } from "../lib/domain-persistence.js";

export {
  hashIdempotencyRequest,
  hashSubmission,
  isUniqueConstraintViolation,
  newDomainId,
} from "../lib/domain-persistence.js";

export async function hashRegisteredIdentity(
  submission: BusinessAuthoritySubmission
): Promise<string> {
  return await sha256(
    `${submission.identity.country}\u0000${submission.identity.pacraRegistrationNumber}`
  );
}
