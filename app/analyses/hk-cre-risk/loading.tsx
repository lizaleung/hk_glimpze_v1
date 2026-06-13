export default function Loading() {
  return (
    <div>
      <div className="h-6 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      <div className="mt-4 h-14 animate-pulse rounded-md bg-slate-100" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-md bg-slate-50" />
        <div className="h-64 animate-pulse rounded-md bg-slate-50" />
      </div>
      <p className="mt-6 text-[12px] text-slate-400">Fetching live HKMA data…</p>
    </div>
  );
}
