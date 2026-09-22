import { ApiError } from "@repo/api-client";

const legacyPendingState = "PENDING_SECOND_APPROVAL";
const canonicalPendingState = "PENDING_INDEPENDENT_REVIEW";
const legacyDeclinedKind = "SECOND_REVIEW_DECLINED";
const canonicalDeclinedKind = "INDEPENDENT_REVIEW_DECLINED";

type CanonicalIndependentReviewState<State extends string> =
  State extends typeof legacyPendingState
    ? typeof canonicalPendingState
    : State;

type CanonicalIndependentReviewKind<Kind extends string> =
  Kind extends typeof legacyDeclinedKind
    ? typeof canonicalDeclinedKind
    : Kind extends typeof legacyPendingState
      ? typeof canonicalPendingState
      : Kind;

interface IndependentReviewEventBoundary {
  readonly kind: string;
}

interface IndependentReviewCaseBoundary {
  readonly events?: readonly IndependentReviewEventBoundary[];
  readonly state: string;
}

type NormalizedIndependentReviewEvent<Event> =
  Event extends IndependentReviewEventBoundary
    ? Omit<Event, "kind"> & {
        readonly kind: CanonicalIndependentReviewKind<Event["kind"]>;
      }
    : Event;

type NormalizedIndependentReviewEvents<
  Events extends readonly IndependentReviewEventBoundary[],
> = {
  readonly [Index in keyof Events]: NormalizedIndependentReviewEvent<
    Events[Index]
  >;
};

type NormalizedIndependentReviewCase<
  Case extends IndependentReviewCaseBoundary,
> = Omit<Case, "events" | "state"> & {
  readonly state: CanonicalIndependentReviewState<Case["state"]>;
} & (Case extends {
    readonly events: infer Events extends
      readonly IndependentReviewEventBoundary[];
  }
    ? { readonly events: NormalizedIndependentReviewEvents<Events> }
    : { readonly events?: readonly IndependentReviewEventBoundary[] });

type NormalizedIndependentReviewResult<Result> = Result extends {
  readonly kind: infer Kind extends string;
}
  ? Omit<Result, "kind"> & {
      readonly kind: CanonicalIndependentReviewKind<Kind>;
    }
  : Result;

function canonicalState<State extends string>(
  state: State
): CanonicalIndependentReviewState<State>;
function canonicalState(state: string): string {
  return state === legacyPendingState ? canonicalPendingState : state;
}

function canonicalKind<Kind extends string>(
  kind: Kind
): CanonicalIndependentReviewKind<Kind>;
function canonicalKind(kind: string): string {
  if (kind === legacyDeclinedKind) {
    return canonicalDeclinedKind;
  }
  return kind === legacyPendingState ? canonicalPendingState : kind;
}

export function normalizeIndependentReviewCase<
  Case extends IndependentReviewCaseBoundary,
>(record: Case): NormalizedIndependentReviewCase<Case>;
export function normalizeIndependentReviewCase(
  record: IndependentReviewCaseBoundary
): IndependentReviewCaseBoundary {
  return {
    ...record,
    ...(record.events
      ? {
          events: record.events.map((event) => ({
            ...event,
            kind: canonicalKind(event.kind),
          })),
        }
      : {}),
    state: canonicalState(record.state),
  };
}

export function normalizeIndependentReviewCasePage<
  Page extends { readonly items: readonly IndependentReviewCaseBoundary[] },
>(
  page: Page
): Omit<Page, "items"> & {
  readonly items: readonly NormalizedIndependentReviewCase<
    Page["items"][number]
  >[];
};
export function normalizeIndependentReviewCasePage(page: {
  readonly items: readonly IndependentReviewCaseBoundary[];
}): { readonly items: readonly IndependentReviewCaseBoundary[] } {
  return {
    ...page,
    items: page.items.map((item) => normalizeIndependentReviewCase(item)),
  };
}

export function normalizeIndependentReviewResult<Result>(
  result: Result
): NormalizedIndependentReviewResult<Result>;
export function normalizeIndependentReviewResult(result: unknown): unknown {
  if (!(typeof result === "object" && result !== null && "kind" in result)) {
    return result;
  }
  const kind = Reflect.get(result, "kind");
  return typeof kind === "string"
    ? { ...result, kind: canonicalKind(kind) }
    : result;
}

export async function postIndependentReviewWithLegacyFallback<T>(requests: {
  readonly canonical: () => Promise<T>;
  readonly legacy: () => Promise<T>;
}): Promise<T> {
  try {
    return await requests.canonical();
  } catch (error) {
    if (
      !(
        error instanceof ApiError &&
        error.code === "NOT_FOUND" &&
        error.status === 404
      )
    ) {
      throw error;
    }
  }
  return await requests.legacy();
}
