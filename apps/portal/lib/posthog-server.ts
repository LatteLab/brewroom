import { PostHog } from 'posthog-node'

let instance: PostHog | null = null

export function getPostHogServer(): PostHog {
  if (!instance) {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!apiKey) {
      throw new Error('NEXT_PUBLIC_POSTHOG_KEY environment variable is not set')
    }
    instance = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return instance
}
