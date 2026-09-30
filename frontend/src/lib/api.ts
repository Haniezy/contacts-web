export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE', 503);
  }
  const data =
    response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(data.error ?? 'SERVICE_UNAVAILABLE', response.status);
  return data as T;
}
export function errorKey(error: unknown) {
  if (!(error instanceof ApiError)) return 'service';
  const keys: Record<string, string> = {
    INVALID_CREDENTIALS: 'credentials',
    EMAIL_ALREADY_EXISTS: 'emailExists',
    INVALID_TWO_FACTOR_CODE: 'invalidCode',
    INVALID_RECOVERY_CODE: 'invalidRecovery',
    INVALID_CHALLENGE: 'expired',
    SETUP_REQUIRED: 'setupExpired',
    TOO_MANY_REQUESTS: 'rateLimit',
    TOO_MANY_ATTEMPTS: 'rateLimit',
    UNAUTHENTICATED: 'unauthenticated',
    TWO_FACTOR_ALREADY_ENABLED: 'alreadyEnabled',
    INVALID_INPUT: 'invalid',
  };
  return keys[error.code] ?? 'service';
}
export function asciiDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit >= '۰' ? 1776 : 1632)),
  );
}
export function displayDigits(value: string, locale: string) {
  return locale === 'fa'
    ? value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
    : value;
}
