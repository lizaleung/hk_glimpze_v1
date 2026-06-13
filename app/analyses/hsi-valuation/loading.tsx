export default function Loading() {
  return (
    <div>
      <div className="h-6 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="mt-8">
          <div className="mb-2 h-3 w-64 animate-pulse rounded bg-slate-100" />
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="h-7 animate-pulse rounded bg-slate-50" />
            ))}
          </div>
        </div>
      ))}
      <p className="mt-6 text-[12px] text-slate-400">
        Fetching live valuation data… this can take a few seconds.
      </p>
    </div>
  );
}
