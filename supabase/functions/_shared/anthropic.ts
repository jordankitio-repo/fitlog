export interface CallOpts {
  maxAttempts?: number
  timeoutMs?: number
}

export type CallResult =
  | { ok: true; text: string }
  | { ok: false; retryable: boolean; status: number | null; error: string }

const RETRYABLE_ERROR_TYPES = new Set([
  'overloaded_error',
  'api_error',
  'rate_limit_error',
])

const NON_RETRYABLE_ERROR_TYPES = new Set([
  'invalid_request_error',
  'authentication_error',
  'permission_error',
  'not_found_error',
])

function retryDelay(attempt: number, retryAfter: string | null): number {
  const computed = 500 * (2 ** attempt) + Math.random() * 250
  const retryAfterMs = Number.parseFloat(retryAfter ?? '') * 1000
  const delay = Number.isFinite(retryAfterMs)
    ? Math.max(computed, retryAfterMs)
    : computed
  return Math.min(delay, 4000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function callAnthropic(
  body: Record<string, unknown>,
  opts: CallOpts = {},
): Promise<CallResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)
  const timeoutMs = Math.max(1, opts.timeoutMs ?? 20000)
  let finalResult: CallResult = {
    ok: false,
    retryable: true,
    status: null,
    error: 'Anthropic request failed',
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let retryAfter: string | null = null

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      retryAfter = response.headers.get('retry-after')

      let data: any = null
      try {
        data = await response.json()
      } catch {
        // A malformed upstream response is handled as a classified failure below.
      }

      const text = data?.content?.[0]?.text
      if (response.ok && data?.type !== 'error' && typeof text === 'string' && text.length > 0) {
        return { ok: true, text }
      }

      const errorType = data?.error?.type
      const statusRetryable = response.status === 429 || response.status === 529 || response.status >= 500
      const explicitlyNonRetryable = [400, 401, 403, 404, 413].includes(response.status) ||
        NON_RETRYABLE_ERROR_TYPES.has(errorType)
      const retryable = statusRetryable ||
        (!explicitlyNonRetryable && RETRYABLE_ERROR_TYPES.has(errorType))

      finalResult = {
        ok: false,
        retryable,
        status: response.status,
        error: data?.error?.message || `Anthropic returned HTTP ${response.status}`,
      }
    } catch (error) {
      finalResult = {
        ok: false,
        retryable: true,
        status: null,
        error: error instanceof Error ? error.message : 'Anthropic network request failed',
      }
    } finally {
      clearTimeout(timeout)
    }

    if (!finalResult.ok && (!finalResult.retryable || attempt === maxAttempts - 1)) {
      return finalResult
    }

    await sleep(retryDelay(attempt, retryAfter))
  }

  return finalResult
}
