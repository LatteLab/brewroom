export default function DirectoryLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        </div>

        {/* Member grid skeleton — 6 cards in 2-col grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border p-4"
            >
              {/* Avatar placeholder */}
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
              {/* Text placeholders */}
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
