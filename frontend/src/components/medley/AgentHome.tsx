import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Command } from "lucide-react";
import type { UiAction } from "@/lib/medley-api";
import { useMedleyStore } from "@/lib/medley-context";
import { clearConversation } from "@/lib/conversation";
import { useAgentConversation } from "@/lib/useAgentConversation";
import { useDockOpen, openDock } from "@/lib/dock";
import { formatTime } from "@/lib/format";
import { ModeSwitch, type TalkMode } from "./ModeSwitch";
import { TextComposer } from "./TextComposer";
import { VoiceConsole } from "./VoiceConsole";

const PROMPTS = [
  "Ring John tomorrow — forgot to ask how the new tablets are treating him",
  "What's outstanding today?",
  "Anyone I haven't followed up in a while?",
];

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The home screen is the agent. One decision sits above everything else — talk
 * or type — and it's a visible switch rather than two half-affordances crammed
 * into one row, because the two conversations behave differently: spoken
 * replies come back out loud and hand the turn straight back to the doctor.
 *
 * Before the first word, the whole thing is centred: there is exactly one thing
 * to do on this screen, so it sits where the eye already is.
 */
export function AgentHome({ onAction }: { onAction: (a: UiAction) => void }) {
  const { tasks, patientById, reload } = useMedleyStore();
  const [mode, setMode] = useState<TalkMode>("voice");
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // The dock is the same conversation in a floating window. Only one surface
  // may hold the microphone, and when the dock is open it is the one holding
  // it — so this one stands down rather than opening a second.
  const dockOpen = useDockOpen();

  const {
    messages,
    streaming,
    busy,
    phase,
    partial,
    micError,
    supported,
    transcribing,
    send,
    toggleVoice,
    reset,
  } = useAgentConversation({ onAction, reload, enabled: !dockOpen });

  const started = messages.length > 0;

  const startOver = () => {
    reset();
    setDraft("");
    clearConversation();
  };

  const changeMode = (next: TalkMode) => {
    if (next === mode) return;
    // Leaving voice means leaving it properly: no microphone still open, no
    // sentence still being read aloud behind a text conversation.
    reset();
    setMode(next);
  };

  const talkSurface = dockOpen ? (
    // Medley is in the floating window; two live microphones on one screen is
    // not a state worth supporting. Say where it went rather than showing a
    // second console that quietly does nothing.
    <button
      type="button"
      onClick={openDock}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-5 py-6 text-body text-muted-foreground hover:border-foreground/30 hover:text-foreground"
    >
      <Command className="h-3.5 w-3.5" aria-hidden />
      <span>Medley is open in the floating window</span>
    </button>
  ) : mode === "voice" ? (
    <VoiceConsole
      phase={phase}
      partial={partial}
      supported={supported}
      transcribing={transcribing}
      error={micError}
      onToggle={toggleVoice}
      onUseText={() => changeMode("text")}
    />
  ) : (
    <TextComposer
      value={draft}
      onChange={setDraft}
      onSubmit={() => void send(draft, false)}
      busy={busy}
      autoFocus={started}
    />
  );

  const upNext = tasks.filter((t) => t.status === "queued").slice(0, 3);

  // Fixed height rather than min-height: the transcript is the scroll
  // container, which is what holds the composer at the bottom of the screen.
  if (started) {
    return (
      <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-3xl flex-col">
        <div className="flex items-center justify-end pb-1">
          <button
            type="button"
            onClick={startOver}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            New conversation
          </button>
        </div>

        <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto py-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <span className="sr-only">{m.role === "user" ? "You said" : "Medley replied"}:</span>
              <p
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body text-primary-foreground"
                    : "max-w-[65ch] text-reading"
                }
              >
                {m.content}
              </p>
            </div>
          ))}
          {/* The reply as it is written. Only when nothing has streamed yet is
              there anything to wait for. */}
          {streaming && <p className="max-w-[65ch] text-reading">{streaming}</p>}
          {busy && !streaming && (
            <div
              role="status"
              className="flex items-center gap-2.5 text-body text-muted-foreground"
            >
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              Reading the record…
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-4 border-t border-border bg-background pt-4">
          <div className="flex justify-center">
            <ModeSwitch mode={mode} onChange={changeMode} disabled={busy} />
          </div>
          {talkSurface}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <h1 className="text-center text-[28px] leading-[1.1] tracking-tight sm:text-[34px]">
          What do you need?
        </h1>
        <p className="mt-4 max-w-md text-center text-body text-muted-foreground">
          Say who to ring and why. Medley reads the record, writes the questions, and phones them.
        </p>

        <div className="mt-8">
          <ModeSwitch mode={mode} onChange={changeMode} disabled={busy} />
        </div>

        <div className="mt-9 w-full max-w-xl">{talkSurface}</div>

        {mode === "text" ? (
          <div className="mt-7 flex max-w-xl flex-wrap justify-center gap-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void send(p, false)}
                disabled={busy}
                className="rounded-full border border-border px-3.5 py-2 text-micro text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50 max-sm:min-h-11"
              >
                {p}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-7 max-w-md text-center text-micro text-muted-foreground">
            Try: “Ring John tomorrow, forgot to ask how the new tablets are treating him.”
          </p>
        )}
      </div>

      {/* Standing state. Nothing hides: what's next stays on the screen even
          while the doctor is mid-instruction. A call in progress is chrome in
          Shell, so it survives the conversation starting. */}
      {upNext.length > 0 && (
        <div className="mx-auto w-full max-w-3xl border-t border-border pt-6">
          <h2 className="mb-1 font-sans text-sm font-medium text-muted-foreground">Up next</h2>
          <ul className="divide-y divide-border">
            {upNext.map((t) => (
              <li key={t.id}>
                <Link
                  to="/calls/$taskId"
                  params={{ taskId: t.id }}
                  className="flex items-baseline gap-3 py-3 transition-colors hover:text-foreground"
                >
                  <span className="w-14 shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatTime(t.scheduledAt)}
                  </span>
                  <span className="font-medium text-body">
                    {patientById(t.patientId)?.name ?? "—"}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{t.purpose}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
