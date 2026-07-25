import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { talkToAgent, type ChatMessage, type UiAction } from "@/lib/medley-api";
import { useMedleyStore } from "@/lib/medley-context";
import { speak, stopSpeaking, useSpeech } from "@/lib/useSpeech";
import {
  clearConversation,
  getConversation,
  setConversation,
  useConversation,
} from "@/lib/conversation";
import { formatTime } from "@/lib/format";
import { ModeSwitch, type TalkMode } from "./ModeSwitch";
import { TextComposer } from "./TextComposer";
import { VoiceConsole, type VoicePhase } from "./VoiceConsole";

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
  const messages = useConversation();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [partial, setPartial] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Refs mirror state that the speech callbacks read. They fire outside React's
  // render cycle, so a closure over state would be one turn behind.
  const busyRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("idle");
  const conversing = useRef(false);
  const sendRef = useRef<(text: string, spoken: boolean) => void>(() => {});

  const started = messages.length > 0;

  const toPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const { supported, transcribing, start, stop } = useSpeech({
    onTranscript: (text) => {
      setPartial("");
      sendRef.current(text, true);
    },
    onPartial: setPartial,
    onSilence: () => {
      // Heard nothing. Say so and hand control back rather than reopening the
      // microphone forever.
      conversing.current = false;
      toPhase("idle");
      setPartial("");
      setMicError("I didn't catch that. Tap the microphone and try again.");
    },
    onError: (reason) => {
      conversing.current = false;
      toPhase("idle");
      setPartial("");
      setMicError(reason);
    },
  });

  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [messages, busy]);

  // Never leave a voice speaking or a microphone open behind us.
  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  const send = useCallback(
    async (text: string, spoken: boolean) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return;

      const next: ChatMessage[] = [...getConversation(), { role: "user", content: trimmed }];
      setConversation(next);
      setDraft("");
      setMicError(null);
      busyRef.current = true;
      setBusy(true);
      if (spoken) toPhase("thinking");

      try {
        const result = await talkToAgent(next, {});
        setConversation([...next, { role: "assistant", content: result.reply }]);
        result.actions.forEach(onAction);
        void reload();

        if (spoken) {
          toPhase("speaking");
          speak(result.reply, () => {
            // The doctor may have cut in or switched to typing while Medley was
            // still talking; in both cases the phase has already moved on.
            if (phaseRef.current !== "speaking") return;
            if (!conversing.current) {
              toPhase("idle");
              return;
            }
            toPhase("listening");
            start();
          });
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? `I couldn't reach the practice system: ${err.message}`
            : "I couldn't reach the practice system. Nothing was saved.";
        setConversation([...next, { role: "assistant", content: message }]);
        if (spoken) {
          conversing.current = false;
          toPhase("idle");
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [onAction, reload, start, toPhase],
  );
  sendRef.current = send;

  const toggleVoice = () => {
    setMicError(null);
    if (phaseRef.current === "listening") {
      conversing.current = false;
      stop();
      setPartial("");
      toPhase("idle");
      return;
    }
    if (phaseRef.current === "speaking") {
      // Barge-in: stop Medley mid-sentence and take the turn.
      stopSpeaking();
      conversing.current = true;
      toPhase("listening");
      start();
      return;
    }
    conversing.current = true;
    toPhase("listening");
    start();
  };

  const startOver = () => {
    conversing.current = false;
    stop();
    stopSpeaking();
    toPhase("idle");
    setPartial("");
    setMicError(null);
    setDraft("");
    clearConversation();
  };

  const changeMode = (next: TalkMode) => {
    if (next === mode) return;
    // Leaving voice means leaving it properly: no microphone still open, no
    // sentence still being read aloud behind a text conversation.
    conversing.current = false;
    stop();
    stopSpeaking();
    toPhase("idle");
    setPartial("");
    setMicError(null);
    setMode(next);
  };

  const talkSurface =
    mode === "voice" ? (
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
          {busy && (
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
