import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, Square, X, GripHorizontal, PictureInPicture2 } from "lucide-react";
import { useMedleyStoreOptional } from "@/lib/medley-context";
import { useAgentConversation } from "@/lib/useAgentConversation";
import { clearConversation } from "@/lib/conversation";
import { closeDock } from "@/lib/dock";
import { usePipWindow } from "@/lib/pip";
import type { UiAction } from "@/lib/medley-api";
import { Mark } from "./Mark";
import { TextComposer } from "./TextComposer";

const WIDTH = 440;
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
  // Computed up front, not in an effect. The dock only ever renders on the
  // client (the open flag is false on the server), so `window` is safe here —
  // and rendering the panel on the first paint is what lets the composer be
  // focused on mount instead of a frame later.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN * 2),
    y: MARGIN * 2,
  }));
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

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

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, streaming, partial]);

  // Escape closes it, and focus goes back to the rail button that opened it —
  // otherwise closing drops the keyboard user at the top of the document.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Not while a confirm is open inside it; Escape should back out of the
      // innermost thing first.
      e.stopPropagation();
      reset();
      closeDock();
      document.querySelector<HTMLButtonElement>("[data-dock-toggle]")?.focus();
    };
    const node = panel.current;
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, [reset]);

  const onPointerDown = (e: React.PointerEvent) => {
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

  // Chrome and Edge only. Everywhere else the button never appears and the
  // in-page dock is the whole feature, unchanged.
  const pip = usePipWindow({ width: WIDTH, height: 620 });
  const floating = Boolean(pip.pipWindow);

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

  const body = (
    <section
      ref={panel}
      // A non-modal dialog: `role="dialog"` without `aria-modal`, because
      // nothing behind it is inert and that is the whole point of the thing.
      role="dialog"
      aria-label="Medley"
      style={
        floating
          ? { width: "100%", height: "100vh" }
          : {
              zIndex: "var(--z-palette)",
              transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
              width: WIDTH,
            }
      }
      className={
        floating
          ? "flex h-full w-full flex-col overflow-hidden bg-popover"
          : `fixed left-0 top-0 flex max-h-[min(680px,85vh)] max-w-[calc(100vw-2rem)] flex-col
             overflow-hidden rounded-2xl border border-border bg-popover shadow-float`
      }
    >
      <header
        onPointerDown={floating ? undefined : onPointerDown}
        onPointerMove={floating ? undefined : onPointerMove}
        onPointerUp={floating ? undefined : endDrag}
        onPointerCancel={floating ? undefined : endDrag}
        className={`flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 ${
          floating ? "" : "cursor-grab touch-none active:cursor-grabbing"
        }`}
      >
        {/* The OS title bar drags the floating window; a grip inside it would
            be a handle that does nothing. */}
        {!floating && (
          <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
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
        {pip.supported && !floating && (
          <button
            type="button"
            onClick={() => void pip.open()}
            title="Float above every window"
            aria-label="Pop out — float Medley above every window"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            reset();
            if (floating) pip.close();
            closeDock();
            document.querySelector<HTMLButtonElement>("[data-dock-toggle]")?.focus();
          }}
          aria-label="Close Medley"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>

      {messages.length > 0 && (
        <div ref={scroller} className="min-h-[120px] flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
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

      {/* The microphone sits above the box rather than beside it, so the place
          you type gets the full width. Typing here is a sentence about a
          patient, not a chat message, and it should be readable while it is
          being written. */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2.5">
          {supported !== false && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={busy && phase !== "speaking"}
              aria-label={label}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
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
                <Square className="relative h-3 w-3 fill-current" aria-hidden />
              ) : (
                <Mic className="relative h-4 w-4" aria-hidden />
              )}
            </button>
          )}
          <p
            role={micError ? "alert" : "status"}
            className={`min-w-0 flex-1 text-micro ${micError ? "text-flag" : "text-muted-foreground"}`}
          >
            {status}
          </p>
        </div>

        <TextComposer
          autoFocus
          value={draft}
          onChange={setDraft}
          onSubmit={() => {
            void send(draft, false);
            setDraft("");
          }}
          busy={busy}
        />
      </div>
    </section>
  );

  /*
   * The React tree stays in this document; only the rendered DOM crosses into
   * the floating window. That is what lets the doctor pop Medley out
   * mid-sentence without dropping the microphone or the half-written reply —
   * the state machine never re-mounts, it just paints somewhere else.
   */
  return pip.pipWindow ? createPortal(body, pip.pipWindow.document.body) : body;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
