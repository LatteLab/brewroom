'use client'

import { useSession } from 'next-auth/react'
import posthog from 'posthog-js'
import { useEffect } from 'react'

export function PostHogIdentifier() {
  const { data: session } = useSession()

  useEffect(() => {
    if (session?.user) {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
        is_admin: session.user.isAdmin,
      })
    } else {
      posthog.reset()
    }
  }, [session])

  return null
}
