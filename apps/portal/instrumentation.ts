import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getPostHogServer } = await import('./lib/posthog-server')
    const posthog = getPostHogServer()

    let distinctId: string | undefined

    if (request.headers.cookie) {
      const cookieString = Array.isArray(request.headers.cookie)
        ? request.headers.cookie.join('; ')
        : request.headers.cookie

      const match = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/)
      if (match?.[1]) {
        try {
          const decoded = decodeURIComponent(match[1])
          const data = JSON.parse(decoded)
          distinctId = data.distinct_id
        } catch {
          // Cookie parse failed — capture without distinct_id
        }
      }
    }

    posthog.captureException(err, distinctId, {
      route_path: context.routePath,
      route_type: context.routeType,
      router_kind: context.routerKind,
      request_method: request.method,
      request_path: request.path,
    })
    await posthog.flush()
  }
}
