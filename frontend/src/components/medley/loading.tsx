/**
 * Loading is shaped like the thing that's coming, not like a spinner in the
 * middle of the page. The doctor's eye lands where the first row will be.
 */

function Bar({ className }: { className: string }) {
  return (
    <span
      className={`block animate-pulse rounded bg-muted motion-reduce:animate-none ${className}`}
    />
  );
}

/** Announced once, so a screen reader isn't read a wall of placeholder rows. */
function Announce({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}

export function ListSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <>
      <Announce label={label} />
      <ul className="divide-y divide-border" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-4 py-4">
            <span className="h-2 w-2 shrink-0 rounded-full bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-full max-w-sm" />
            </div>
            <div className="hidden shrink-0 space-y-2 sm:block">
              <Bar className="h-3.5 w-10" />
              <Bar className="h-3 w-14" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function DetailSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <>
      <Announce label={label} />
      <div className="space-y-8" aria-hidden>
        <div className="space-y-3">
          <Bar className="h-3.5 w-24" />
          <Bar className="h-8 w-full max-w-md" />
          <Bar className="h-3.5 w-56" />
        </div>
        <div className="space-y-2.5">
          <Bar className="h-4 w-36" />
          <Bar className="h-3.5 w-full max-w-xl" />
          <Bar className="h-3.5 w-full max-w-lg" />
          <Bar className="h-3.5 w-2/3 max-w-md" />
        </div>
      </div>
    </>
  );
}
