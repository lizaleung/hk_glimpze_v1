/** Reusable error state for failed/rate-limited data fetches. */
export function ErrorPanel({
  title = "Couldn't load data",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
      <div className="text-sm font-medium text-red-800">{title}</div>
      <p className="mt-1 text-[13px] text-red-700">{message}</p>
      <p className="mt-2 text-[12px] text-red-600">
        Financial APIs rate-limit and occasionally fail. Reload the page to retry.
      </p>
    </div>
  );
}
