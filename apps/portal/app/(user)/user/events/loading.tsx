export default function EventsLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8 flex items-center justify-between">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-9 w-48 animate-pulse rounded-full bg-muted" />
        </div>

        {/* Timeline skeleton — 3 date groups */}
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, groupIdx) => (
            <div key={groupIdx}>
              {/* Date label */}
              <div className="mb-3 flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              </div>

              {/* Event cards */}
              <div className="ml-[22px] space-y-3 md:ml-0">
                {Array.from({ length: groupIdx === 0 ? 2 : 1 }).map((_, cardIdx) => (
                  <div
                    key={cardIdx}
                    className="flex gap-4 rounded-xl bg-card p-4 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08)]"
                  >
                    {/* Left: text placeholders */}
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                    {/* Right: image placeholder */}
                    <div className="h-[110px] w-[110px] shrink-0 animate-pulse rounded-lg bg-muted sm:h-[120px] sm:w-[120px]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
