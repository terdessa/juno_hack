import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mic, ArrowUp, Volume2, VolumeX } from "lucide-react";
import { talkToAgent, type ChatMessage, type UiAction } from "@/lib/medley-api";
import { useMedleyStore } from "@/lib/medley-store";
import { speak, useSpeech } from "@/lib/useSpeech";
import { formatTime } from "@/lib/format";

const PROMPTS = [
  "Ring John tomorrow — forgot to ask how the new tablets are treating him",
  "What's outstanding today?",
  "Anyone I haven't followed up in a while?",
];

/**
 * The home screen is the agent. Everything else is somewhere you go from
 * here, so nothing competes with the conversation.
 */
export function AgentHome({ onAction }: { onAction: (a: UiAction) => void }) {
  const { tasks, patientById, reload } = useMedleyStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const result = await talkToAgent(next, { currentView: "calls" });
      setMessages([...next, { role: "assistant", content: result.reply }]);
      if (voiceReplies) speak(result.reply);
      result.actions.forEach(onAction);
      void reload();
    } catch (err) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: err instanceof Error ? `Something broke: ${err.message}` : "Something broke.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const { listening, supported, toggle } = useSpeech((text) => void send(text));

  const live = tasks.find((t) => t.status === "calling");
  const upNext = tasks.filter((t) => t.status === "queued").slice(0, 3);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col">
      {!started && (
        <div className="pt-10 pb-8">
          <h1 className="font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl">
            What do you need?
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Say it the way you'd say it out loud. I'll read the patient's record and
            write the questions before anyone calls them.
          </p>
        </div>
      )}

      {started && (
        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto py-6">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[15px] text-primary-foreground"
                  : "max-w-[85%] text-[17px] leading-relaxed"
              }
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2.5 text-[15px] text-muted-foreground">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              Reading the record…
            </div>
          )}
        </div>
      )}

      {/* Composer. Big target, mic first — speaking is the primary input. */}
      <div className={started ? "sticky bottom-6 pt-2" : ""}>
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-soft focus-within:border-foreground/25">
          {supported && (
            <button
              onClick={toggle}
              disabled={busy}
              aria-label={listening ? "Stop listening" : "Speak to Medley"}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors disabled:opacity-40 ${
                listening
                  ? "bg-live text-live-foreground"
                  : "bg-secondary text-foreground hover:bg-accent"
              }`}
            >
              <Mic className="h-[18px] w-[18px]" />
            </button>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={1}
            placeholder={listening ? "Listening…" : "Tell Medley what you need"}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-3 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => setVoiceReplies((v) => !v)}
            aria-label={voiceReplies ? "Mute spoken replies" : "Speak replies aloud"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {voiceReplies ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
          </button>
          <button
            onClick={() => void send(draft)}
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <ArrowUp className="h-[18px] w-[18px]" />
          </button>
        </div>

        {!started && (
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => void send(p)}
                className="rounded-full border border-border px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Standing state, below the fold of the conversation. Nothing hides. */}
      {!started && (live || upNext.length > 0) && (
        <div className="mt-12 border-t border-border pt-6">
          {live && (
            <Link
              to="/calls/$taskId"
              params={{ taskId: live.id }}
              className="mb-4 flex items-center gap-3 rounded-xl bg-live-surface px-4 py-3 transition-opacity hover:opacity-85"
            >
              <span className="pulse-dot inline-block h-2 w-2 shrink-0 rounded-full bg-live" />
              <span className="text-sm font-medium text-live">On a call now</span>
              <span className="truncate text-sm text-foreground">
                {patientById(live.patientId)?.name} · {live.purpose}
              </span>
            </Link>
          )}

          {upNext.length > 0 && (
            <>
              <div className="mb-2 text-sm font-medium text-muted-foreground">Up next</div>
              <ul className="divide-y divide-border">
                {upNext.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/calls/$taskId"
                      params={{ taskId: t.id }}
                      className="flex items-baseline gap-3 py-2.5 transition-colors hover:text-foreground"
                    >
                      <span className="w-14 shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatTime(t.scheduledAt)}
                      </span>
                      <span className="font-display text-[15px]">
                        {patientById(t.patientId)?.name ?? "—"}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">{t.purpose}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
