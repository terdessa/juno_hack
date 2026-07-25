import { Mic, Volume2 } from "lucide-react";
import type { VoicePhase } from "@/lib/useAgentConversation";

export type { VoicePhase };

const COPY: Record<VoicePhase, { status: string; hint: string; action: string }> = {
  idle: {
    status: "Ready when you are",
    hint: "Tap, then talk. Medley replies out loud.",
    action: "Start talking to Medley",
  },
  listening: {
    status: "Listening",
    hint: "Stop when you're done, or just pause.",
    action: "Stop listening",
  },
  thinking: {
    status: "Reading the record",
    hint: "Working out what needs asking.",
    action: "Medley is thinking",
  },
  speaking: {
    status: "Medley is speaking",
    hint: "Tap to cut in and reply.",
    action: "Interrupt and reply",
  },
};

/**
 * The voice half of the conversation. One control, four states, and the state
 * is always written out in words as well as shown — a doctor glancing at this
 * from a metre away needs to know whose turn it is without interpreting an
 * animation.
 */
export function VoiceConsole({
  phase,
  partial,
  supported,
  transcribing,
  error,
  onToggle,
  onUseText,
}: {
  phase: VoicePhase;
  partial: string;
  /** null while we haven't established whether this browser can listen. */
  supported: boolean | null;
  /**
   * Only browsers without local recognition reach this: their words are on
   * their way to be transcribed. Saying so fills what would otherwise be a
   * second of the console looking idle straight after the doctor spoke.
   */
  transcribing: boolean;
  error: string | null;
  onToggle: () => void;
  onUseText: () => void;
}) {
  if (supported === false) {
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-6 text-center">
        <p className="text-body font-medium">This browser can't hear you</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          It has no microphone we can reach. Everything works the same typed.
        </p>
        <button
          type="button"
          onClick={onUseText}
          className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Type instead
        </button>
      </div>
    );
  }

  const copy = transcribing
    ? { status: "Getting that down", hint: "One moment.", action: "Transcribing" }
    : COPY[phase];
  const active = phase === "listening";
  const thinking = phase === "thinking" || transcribing;
  const speaking = phase === "speaking";

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onToggle}
        disabled={thinking}
        aria-label={copy.action}
        className={`relative grid h-20 w-20 place-items-center rounded-full transition-[background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-offset-4 disabled:cursor-wait sm:h-24 sm:w-24 ${
          active
            ? "bg-primary text-primary-foreground shadow-float"
            : "border border-input bg-card text-foreground shadow-soft hover:border-foreground/30 hover:bg-secondary"
        }`}
      >
        {/* Two offset rings so the pulse reads as continuous rather than a loop
            restarting. Present only while a turn is actually in progress. */}
        {(active || speaking) && (
          <>
            <span className="mic-ring" aria-hidden />
            <span className="mic-ring" style={{ animationDelay: "1.2s" }} aria-hidden />
          </>
        )}

        {speaking ? (
          <Volume2 className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
        ) : (
          <Mic className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
        )}
      </button>

      {/* One live region for the whole exchange, so a screen reader announces
          each turn once instead of racing itself. */}
      <div aria-live="polite" className="mt-5 flex flex-col items-center">
        <div className="flex items-center gap-2">
          {thinking && (
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          )}
          {speaking && (
            <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="eq-bar w-[3px] origin-bottom rounded-full bg-foreground"
                  style={{ height: "100%", animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          )}
          <span className="text-body font-medium">{copy.status}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{copy.hint}</p>

        {partial && (
          <p className="mt-4 max-w-md text-center text-reading text-muted-foreground">{partial}</p>
        )}
      </div>

      {error && (
        <div className="mt-5 max-w-md rounded-xl bg-flag-surface px-4 py-3 text-center">
          <p className="text-sm leading-relaxed text-flag">{error}</p>
          <button
            type="button"
            onClick={onUseText}
            className="mt-1.5 text-sm font-medium text-foreground underline underline-offset-4"
          >
            Type instead
          </button>
        </div>
      )}
    </div>
  );
}
