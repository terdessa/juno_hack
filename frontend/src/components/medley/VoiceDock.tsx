import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, X, GripHorizontal, CornerDownLeft } from "lucide-react";
import { useMedleyStoreOptional } from "@/lib/medley-context";
import { useAgentConversation } from "@/lib/useAgentConversation";
import { clearConversation } from "@/lib/conversation";
import { closeDock } from "@/lib/dock";
import type { UiAction } from "@/lib/medley-api";
import { Mark } from "./Mark";

const WIDTH = 380;
const MARGIN = 16;

/**
 * Medley, in a window the doctor can put wherever they need it.
 *
 * ⌘K opens it. It floats over whatever they were reading rather than taking
 * them away from it, because the thing they want to say is almost always
 * *about* what is on screen — "ring him about this" only makes sense next to
 * the record it refers to.
 *
 * It is deliberately not a modal: nothing behind it is disabled, and it never
 * traps focus. It is a thing on the desk, not a door.
 */
export function VoiceDock({ onAction }: { onAction: (a: UiAction) => void }) {
  // Optional: the dock is chrome on every route, and a route without the data
  // provider should lose the list refresh, not the ability to talk.
  const store = useMedleyStoreOptional();
  const reload = useCallback(() => {
    void store?.reload();
  }, [store]);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const {
    messages,
    streaming,
    busy,
    phase,
    partial,
    micError,
    supported,
    transcribing,
    level,
    send,
    toggleVoice,
    reset,
  } = useAgentConversation({ onAction, reload });

  const [draft, setDraft] = useState("");

  // Bottom-right on first paint, then wherever it is put. Measured rather than
  // hardcoded so it lands on screen on a laptop and a 32-inch monitor alike.
  useEffect(() => {
    if (pos) return;
    setPos({ x: window.innerWidth - WIDTH - MARGIN * 2, y: MARGIN * 2 });
  }, [pos]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, streaming, partial]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pos) return;
    dragging.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragging.current;
    if (!drag) return;
    // Clamped so the window can never be dragged somewhere it can't be
    // dragged back from — a title bar off the top edge is unrecoverable.
    setPos({
      x: clamp(e.clientX - drag.dx, MARGIN - WIDTH + 80, window.innerWidth - 80),
      y: clamp(e.clientY - drag.dy, MARGIN, window.innerHeight - 60),
    });
  }, []);

  const endDrag = () => {
    dragging.current = null;
  };

  const listening = phase === "listening";
  const label = listening
    ? "Stop and send"
    : phase === "speaking"
      ? "Interrupt"
      : "Talk to Medley";

  const status = micError
    ? micError
    : transcribing
      ? "Making that out…"
      : phase === "listening"
        ? partial || "Listening — stop talking and I'll send it."
        : phase === "thinking"
          ? "Reading the record…"
          : phase === "speaking"
            ? "Speaking — tap to cut in."
            : messages.length === 0
              ? "Say who to ring and why."
              : "";

  if (!pos) return null;

  return (
    <section
      aria-label="Medley"
      style={{
        zIndex: "var(--z-palette)",
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        width: WIDTH,
      }}
      className="fixed left-0 top-0 flex max-h-[min(560px,80vh)] max-w-[calc(100vw-2rem)] flex-col
                 overflow-hidden rounded-2xl border border-border bg-popover shadow-float"
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex shrink-0 cursor-grab touch-none items-center gap-2 border-b border-border px-3 py-2.5 active:cursor-grabbing"
      >
        <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Mark className="h-3.5 w-3.5 text-foreground" />
        <span className="flex-1 select-none text-micro font-medium">Medley</span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              reset();
              clearConversation();
            }}
            className="rounded-md px-1.5 py-1 text-micro text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            reset();
            closeDock();
          }}
          aria-label="Close Medley"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>

      {messages.length > 0 && (
        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <p
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-micro text-primary-foreground"
                    : "text-body leading-relaxed"
                }
              >
                {m.content}
              </p>
            </div>
          ))}
          {streaming && <p className="text-body leading-relaxed">{streaming}</p>}
        </div>
      )}

      <div className="shrink-0 border-t border-border p-3">
        {status && (
          <p
            role={micError ? "alert" : "status"}
            className={`mb-2.5 min-h-[1.25rem] text-micro ${micError ? "text-flag" : "text-muted-foreground"}`}
          >
            {status}
          </p>
        )}

        <div className="flex items-center gap-2">
          {supported !== false && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={busy && phase !== "speaking"}
              aria-label={label}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                listening
                  ? "bg-live text-background"
                  : "bg-secondary text-foreground hover:bg-secondary/70"
              }`}
            >
              {/* The ring is the microphone proving it can hear. A flat button
                  during silence is indistinguishable from a broken one. */}
              {listening && (
                <span
                  aria-hidden
                  style={{ transform: `scale(${1 + level * 0.9})`, opacity: 0.25 + level * 0.4 }}
                  className="absolute inset-0 rounded-full bg-live transition-transform duration-75 motion-reduce:hidden"
                />
              )}
              {listening ? (
                <Square className="relative h-3.5 w-3.5 fill-current" aria-hidden />
              ) : (
                <Mic className="relative h-4 w-4" aria-hidden />
              )}
            </button>
          )}

          <form
            className="flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft, false);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={supported === false ? "Type what you need" : "…or type it"}
              aria-label="Message to Medley"
              className="min-w-0 flex-1 rounded-lg bg-secondary px-3 py-2 text-body outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="Send"
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              <CornerDownLeft className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
