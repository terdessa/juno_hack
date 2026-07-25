import { useRef, useState, type ReactNode } from "react";
import type { Patient } from "@/lib/mock-data";

const CARD_W = 304;
const CARD_H = 260;

/**
 * A glance at the record without leaving the list. Follows the cursor, opens
 * after a beat so it doesn't flicker while the doctor scans down the page,
 * and never intercepts the click — the row underneath still navigates.
 */
export function PatientPeek({ patient, children }: { patient: Patient; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    timer.current = setTimeout(() => setPos({ x: clientX, y: clientY }), 220);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  };

  return (
    <div
      onMouseEnter={open}
      onMouseMove={(e) => pos && setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={close}
    >
      {children}
      {pos && (
        <div
          role="presentation"
          className="pointer-events-none fixed z-50 hidden w-[19rem] rounded-xl border border-border bg-popover p-4 shadow-float lg:block"
          style={{
            left: Math.min(pos.x + 20, window.innerWidth - CARD_W),
            top: Math.min(pos.y + 16, window.innerHeight - CARD_H),
          }}
        >
          <div className="font-display text-lg leading-tight">{patient.name}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {patient.age} · {patient.nhsNumber}
          </div>

          <div className="mt-3 text-[13px] font-medium">{patient.condition}</div>

          {patient.medications.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {patient.medications.map((m) => (
                <li key={m} className="text-[13px] text-muted-foreground">
                  {m}
                </li>
              ))}
            </ul>
          )}

          {patient.notes && (
            <p className="mt-3 line-clamp-3 border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
              {patient.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
