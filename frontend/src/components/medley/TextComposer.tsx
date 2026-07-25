import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

/**
 * The typed half of the conversation. Grows with the instruction rather than
 * scrolling inside three lines, because what a doctor dictates here is a
 * sentence or two, not a paragraph, and seeing all of it is the point.
 */
export function TextComposer({
  value,
  onChange,
  onSubmit,
  busy,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  autoFocus?: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy;

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  return (
    <div>
      {/* Focus lands on the textarea but reads on the whole composer, so the
          boundary the doctor sees is the boundary that's active. */}
      <div className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-soft transition-colors focus-within:border-foreground/40 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        <label className="sr-only" htmlFor="medley-instruction">
          What you need from Medley
        </label>
        <textarea
          id="medley-instruction"
          ref={field}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          rows={1}
          disabled={busy}
          placeholder="Ring Mrs Okafor tomorrow about her new inhaler"
          className="max-h-50 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-body outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label="Send to Medley"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-95 disabled:opacity-25 disabled:active:scale-100 motion-reduce:active:scale-100"
        >
          <ArrowUp className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-center text-micro text-muted-foreground">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}
