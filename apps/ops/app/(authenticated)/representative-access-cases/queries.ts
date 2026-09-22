import { type ApiClient, unwrap } from "@repo/api-client";
import type {
  RepresentativeAuthoritySubmission,
  RepresentativePermission,
} from "@repo/business";

export type RepresentativeCaseSubjectType =
  | "REPRESENTATIVE_AUTHORIZATION"
  | "REPRESENTATIVE_AUTHORIZATION_CONTROL"
  | "REPRESENTATIVE_PERMISSION_CHANGE";

export interface RepresentativeCaseSummary {
  authorizationId: string;
  businessId: string;
  caseId: string;
  createdAt: string;
  permissionChangeId: string | null;
  state: string;
  subjectType: RepresentativeCaseSubjectType;
  updatedAt: string;
}

export interface RepresentativeCaseDetail extends RepresentativeCaseSummary {
  authorization: {
    accountId: string;
    authorizationId: string;
    displayName: string;
    permissions: readonly RepresentativePermission[];
    state:
      | "PENDING"
      | "ACTIVE"
      | "SUSPENDED"
      | "ENDED"
      | "REVOKED"
      | "REJECTED";
  };
  checklist: readonly {
    checklistVersion: string;
    id: string;
    key: string;
    reviewSequence: number;
    reviewerAccountId: string;
    state: "PASSED" | "FAILED" | "UNRESOLVED" | "NOT_APPLICABLE";
  }[];
  decisions: readonly {
    id: string;
    kind: "APPROVE" | "REJECT" | "SUSPEND" | "REVOKE" | "RESTORE";
    proposedAt: string;
    proposedByAccountId: string;
    requiresIndependentReview: boolean;
  }[];
  effects: readonly {
    appliedAt: string;
    decisionId: string;
    decisionKind: string;
    id: string;
    resultAuthorizationState: string | null;
    resultPermissionChangeState: string | null;
  }[];
  events: readonly {
    id: string;
    kind: string;
    occurredAt: string;
    sequence: number;
  }[];
  requestedPermissions: readonly RepresentativePermission[] | null;
  reviews: readonly {
    decisionId: string;
    id: string;
    outcome: "CONFIRM" | "DECLINE";
    reviewedAt: string;
    reviewerAccountId: string;
  }[];
  revision: {
    id: string;
    revisionNumber: number;
    submission: RepresentativeAuthoritySubmission;
    submittedAt: string;
  } | null;
}

export const representativeCaseKeys = {
  detail: (caseId: string) =>
    ["operations", "representative-access-case", caseId] as const,
  queue: () => ["operations", "representative-access-cases"] as const,
};

export async function fetchRepresentativeCases(
  client: ApiClient
): Promise<readonly RepresentativeCaseSummary[]> {
  return (await unwrap(
    client.v1.operations["representative-access-cases"].$get()
  )) as readonly RepresentativeCaseSummary[];
}

export async function fetchRepresentativeCase(
  client: ApiClient,
  caseId: string
): Promise<RepresentativeCaseDetail> {
  return (await unwrap(
    client.v1.operations["representative-access-cases"][":caseId"].$get({
      param: { caseId },
    })
  )) as unknown as RepresentativeCaseDetail;
}
