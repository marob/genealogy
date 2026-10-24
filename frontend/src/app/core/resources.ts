import { HttpErrorResponse } from '@angular/common/http';
import type { Resource } from '@angular/core';

/**
 * Value of a resource, or `undefined` while it has none. Unlike
 * `resource.value()`, never throws when the resource is in error state.
 */
export function valueOf<T>(resource: Resource<T>): T | undefined {
  return resource.hasValue() ? resource.value() : undefined;
}

/** Whether an error is an HTTP 404 (possibly wrapped by a resource). */
export function isNotFound(error: unknown): boolean {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
  return [error, cause].some((candidate) => candidate instanceof HttpErrorResponse && candidate.status === 404);
}
