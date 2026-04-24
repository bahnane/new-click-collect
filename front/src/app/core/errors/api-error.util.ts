import { HttpErrorResponse } from '@angular/common/http';

type ApiErrorResponse = {
  statusCode?: number;
  code?: string;
  message?: string;
  details?: unknown;
  path?: string;
  timestamp?: string;
};

export function extractApiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const body = error.error as ApiErrorResponse | null;
  if (!body || typeof body.code !== 'string') {
    return null;
  }

  return body.code;
}
