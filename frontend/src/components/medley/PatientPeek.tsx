import { useId, useRef, useState, type ReactNode } from "react";
import type { Patient } from "@/lib/types";

const CARD_W = 304;
const CARD_H = 268;
const GUTTER = 16;

/**
 * A glance at the record without leaving the list. Opens after a beat so it
 * doesn't flicker while the doctor scans down the page, and never intercepts
 * the click — the row underneath still navigates.
 *
 * Anchored to the row rather than following the cursor: a card that chases the
 * pointer re-renders on every mouse frame and is unreachable by keyboard. This
 * one opens on focus too, and describes the row it belongs to.
 */
export function PatientPeek({ patient, children }: { patient: Patient; children: ReactNode }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const row = wrapper.current?.getBoundingClientRect();
      if (!row) return;
      setAt({
        top: Math.max(GUTTER, Math.min(row.top, window.innerHeight - CARD_H - GUTTER)),
        left: Math.max(GUTTER, Math.min(row.right - CARD_W, window.innerWidth - CARD_W - GUTTER)),
      });
    }, 220);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setAt(null);
  };

  return (
    <div
      ref={wrapper}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      aria-describedby={at ? id : undefined}
    >
      {children}
      {at && (
        <div
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-50 hidden w-76 rounded-xl border border-border bg-popover p-4 shadow-float lg:block"
          style={{ top: at.top, left: at.left }}
        >
          <div className="font-medium text-lg leading-tight">{patient.name}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {patient.age} · NHS {patient.nhsNumber}
          </div>

          <div className="mt-3 text-micro font-medium">{patient.condition}</div>

          {patient.medications.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {patient.medications.map((m) => (
                <li key={m} className="text-micro text-muted-foreground">
                  {m}
                </li>
              ))}
            </ul>
          )}

          {patient.notes && (
            <p className="mt-3 line-clamp-3 border-t border-border pt-3 text-micro text-muted-foreground">
              {patient.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
