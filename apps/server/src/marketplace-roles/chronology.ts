interface TimestampedProjection {
  readonly updatedAt: Date;
}

export function eventPrecedesLockedProjection(
  occurredAt: Date,
  projections: readonly (TimestampedProjection | null)[]
): boolean {
  return projections.some(
    (projection) =>
      projection !== null &&
      occurredAt.valueOf() < projection.updatedAt.valueOf()
  );
}
