'use client';

import { ErrorBoundaryContent } from '@/components/error-boundary-content';

export default function UserError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryContent {...props} />;
}
