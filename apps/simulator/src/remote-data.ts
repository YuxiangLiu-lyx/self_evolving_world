export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}

export function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Missing ${field}.`);
  return value;
}

export async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') ?? 'unavailable';
    throw new Error(
      `Remote request failed: HTTP ${String(response.status)}; request ID ${requestId}. No retry was attempted.`,
    );
  }
  return response.json() as Promise<unknown>;
}
