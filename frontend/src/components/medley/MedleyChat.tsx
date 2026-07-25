import { useEffect, useRef, useState } from "react";
import { Mic, Send, X, Volume2, VolumeX } from "lucide-react";
import { talkToAgent, type ChatMessage, type UiAction } from "@/lib/medley-api";
import { useMedleyStore } from "@/lib/medley-store";
import { speak, useSpeech } from "@/lib/useSpeech";

const OPENER =
  "What do you need? Tell me who to call and what to ask — I'll read their record and write the questions.";

export function MedleyChat({
  onClose,
  onAction,
  currentPatientId,
  currentView,
}: {
  onClose: () => void;
  onAction: (action: UiAction) => void;
  currentPatientId: string | null;
  currentView: string;
}) {
  const { reload } = useMedleyStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: OPENER },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

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
      // The opener is ours, not the agent's — don't send it as context.
      const history = next.filter((m, i) => !(i === 0 && m.role === "assistant"));
      const result = await talkToAgent(history, { currentPatientId, currentView });

      setMessages([...next, { role: "assistant", content: result.reply }]);
      if (voiceReplies) speak(result.reply);

      // Anything the agent did to the database shows up on the dashboard.
      if (result.actions.length) {
        result.actions.forEach(onAction);
        void reload();
      } else {
        void reload();
      }
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

  // Speaking submits directly — the point is not to touch the keyboard.
  const { listening, supported, toggle } = useSpeech((text) => void send(text));

  return (
    <div className="fixed inset-0 z-40 grid place-items-end justify-items-end bg-foreground/20 p-4 backdrop-blur-[2px] sm:p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(640px,85vh)] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-float"
      >
        <header className="flex items-center justify-between border-b border-border/60 bg-sidebar/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
              M
            </div>
            <div className="text-sm font-medium">Medley</div>
            {listening && (
              <span className="ml-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                Listening
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVoiceReplies((v) => !v)}
              title={voiceReplies ? "Mute replies" : "Speak replies"}
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {voiceReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground"
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="flex max-w-[85%] items-center gap-2 rounded-2xl bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              Reading the record…
            </div>
          )}
        </div>

        <div className="border-t border-border/60 bg-secondary/30 px-3 py-3">
          <div className="flex items-end gap-2">
            {supported && (
              <button
                onClick={toggle}
                disabled={busy}
                title={listening ? "Stop listening" : "Speak"}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${
                  listening
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mic className="h-4 w-4" />
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
              placeholder={listening ? "Listening…" : "Say it how you'd say it out loud…"}
              className="max-h-28 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={() => void send(draft)}
              disabled={!draft.trim() || busy}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {!supported && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Voice input needs Chrome or Edge. Typing works everywhere.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
