/**
 * Platform SDK Errors
 *
 * Typed error handling matching ResourceAPI and PublicAPI error formats.
 */

export interface PlatformErrorDetails {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class PlatformError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(error: PlatformErrorDetails) {
    super(error.message);
    this.name = 'PlatformError';
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
  }

  static async fromResponse(response: Response): Promise<PlatformError> {
    let body: Record<string, unknown> = {};
    try {
      body = await response.json();
    } catch {
      // Response body is not JSON
    }

    return new PlatformError({
      status: response.status,
      code: (body.code as string) || `HTTP_${response.status}`,
      message: (body.message as string) || (body.detail as string) || response.statusText,
      details: body.details as Record<string, unknown> | undefined,
    });
  }

  /** True if this is a version conflict (optimistic locking failure). */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** True if this is a validation error (422). */
  get isValidation(): boolean {
    return this.status === 422;
  }

  /** True if the resource was not found (404). */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True if the user is not authenticated (401). */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True if the user lacks permissions (403). */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}
