import { type ReactNode } from "react";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface WeekDay<T> {
  date: Date;
  isToday: boolean;
  items: T[];
}

/**
 * A week, seven columns, whatever you put in them.
 *
 * Shared because the page shows two calendars and they must line up: same
 * columns, same day headers, same empty state. Two hand-built grids would
 * drift by a pixel and read as two unrelated things rather than two views of
 * one week.
 */
export function WeekGrid<T>({
  days,
  loading,
  renderItem,
  emptyLabel,
}: {
  days: WeekDay<T>[];
  loading: boolean;
  renderItem: (item: T) => ReactNode;
  /** Shown in a day with nothing in it, quietly. */
  emptyLabel?: string;
}) {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-7">
      {days.map(({ date, isToday, items }) => (
        <div
          key={date.toISOString()}
          className={`min-h-32 p-3 ${isToday ? "bg-secondary" : "bg-card"}`}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-micro font-medium uppercase tracking-wide text-muted-foreground">
              {DAY_NAMES[(date.getDay() + 6) % 7]}
            </span>
            <span
              className={`text-body tabular-nums ${
                isToday ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {date.getDate()}
            </span>
            {isToday && <span className="text-micro text-muted-foreground">Today</span>}
          </div>

          {loading ? (
            <div className="mt-3 space-y-2" aria-hidden>
              <span className="block h-3 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <span className="block h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
          ) : items.length === 0 ? (
            emptyLabel && <p className="mt-2 text-micro text-muted-foreground">{emptyLabel}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {items.map((item, i) => (
                <li key={i}>{renderItem(item)}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
