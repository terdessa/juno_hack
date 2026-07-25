import { useRef } from "react";
import { Mic, Keyboard } from "lucide-react";

export type TalkMode = "voice" | "text";

const OPTIONS = [
  { id: "voice", label: "Speak", description: "Voice conversation", icon: Mic },
  { id: "text", label: "Type", description: "Text conversation", icon: Keyboard },
] as const;

/**
 * Chooses how the doctor and Medley talk to each other. Two modes only, both
 * always visible, with the thumb sliding between them — the choice is a state
 * you can see rather than a setting you have to remember.
 *
 * Radiogroup rather than tabs: this picks an input method, it doesn't reveal a
 * panel of unrelated content. Arrow keys move between the two, matching what
 * a screen-reader user is told to expect.
 */
export function ModeSwitch({
  mode,
  onChange,
  disabled = false,
}: {
  mode: TalkMode;
  onChange: (mode: TalkMode) => void;
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = OPTIONS.findIndex((o) => o.id === mode);

  const move = (delta: number) => {
    const next = (index + delta + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="How you talk to Medley"
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
      className={`relative grid w-[17.5rem] grid-cols-2 rounded-full border border-border bg-secondary p-1 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      {/* The thumb. One element that slides, so the movement reads as the same
          control changing rather than two things swapping. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-card shadow-soft transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />

      {OPTIONS.map((option, i) => {
        const selected = option.id === mode;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.description}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`relative z-10 flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed ${
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
