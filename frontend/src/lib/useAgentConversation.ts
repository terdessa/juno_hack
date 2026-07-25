/**
 * Talking to Medley: the whole turn-taking machine, in one place.
 *
 * Two surfaces run this — the home screen and the floating dock — and any
 * difference between them would be a bug of the same kind as a scheduled call
 * behaving unlike a manual one. So neither owns it.
 *
 * Only one may be live at a time, because both would open a microphone. The
 * caller passes `enabled: false` to stand down.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { talkToAgent, type ChatMessage, type UiAction } from "./medley-api";
import { speakStream, stopSpeaking, useSpeech } from "./useSpeech";
import { getConversation, setConversation, useConversation } from "./conversation";

/** Where the doctor is in the loop. Drives every affordance on both surfaces. */
export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

interface Options {
  /** Replays what the agent did to the dashboard — opening a patient, etc. */
  onAction: (action: UiAction) => void;
  /** Refreshes the lists after a turn that may have written something. */
  reload: () => void;
  /** False when another surface owns the microphone. */
  enabled?: boolean;
}

export function useAgentConversation({ onAction, reload, enabled = true }: Options) {
  const messages = useConversation();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [partial, setPartial] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  /** The reply so far, rendered live under the transcript. */
  const [streaming, setStreaming] = useState("");

  // Refs mirror state the speech callbacks read. They fire outside React's
  // render cycle, so a closure over state would be one turn behind.
  const busyRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("idle");
  const conversing = useRef(false);
  const sendRef = useRef<(text: string, spoken: boolean) => void>(() => {});

  const toPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const { supported, transcribing, level, start, stop } = useSpeech({
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

  const send = useCallback(
    async (text: string, spoken: boolean) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return;

      const next: ChatMessage[] = [...getConversation(), { role: "user", content: trimmed }];
      setConversation(next);
      setMicError(null);
      setStreaming("");
      busyRef.current = true;
      setBusy(true);
      if (spoken) toPhase("thinking");

      // Speaking starts on the first finished sentence rather than the last,
      // so the voice begins while the rest of the answer is still arriving.
      const voice = spoken ? speakStream(handOverToMicrophone) : null;

      try {
        const result = await talkToAgent(next, {}, {
          onText: (soFar) => {
            setStreaming(soFar);
            // The first token is also the moment the reply stops being a wait.
            if (spoken && phaseRef.current === "thinking") toPhase("speaking");
            voice?.push(soFar);
          },
          onDiscard: () => {
            // That text was a preamble to a tool call; the real answer is still
            // coming. Take it back before it is read out.
            setStreaming("");
            voice?.cancel();
            if (spoken) toPhase("thinking");
          },
          onAction,
        });

        setConversation([...next, { role: "assistant", content: result.reply }]);
        setStreaming("");
        reload();
        voice?.end(result.reply);
      } catch (err) {
        const message =
          err instanceof Error
            ? `I couldn't reach the practice system: ${err.message}`
            : "I couldn't reach the practice system. Nothing was saved.";
        setConversation([...next, { role: "assistant", content: message }]);
        setStreaming("");
        stopSpeaking();
        if (spoken) {
          conversing.current = false;
          toPhase("idle");
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }

      function handOverToMicrophone() {
        // The doctor may have cut in or switched to typing while Medley was
        // still talking; in both cases the phase has already moved on.
        if (phaseRef.current !== "speaking") return;
        if (!conversing.current) {
          toPhase("idle");
          return;
        }
        toPhase("listening");
        start();
      }
    },
    [onAction, reload, start, toPhase],
  );
  sendRef.current = send;

  const toggleVoice = useCallback(() => {
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
  }, [start, stop, toPhase]);

  const reset = useCallback(() => {
    conversing.current = false;
    stop();
    stopSpeaking();
    toPhase("idle");
    setPartial("");
    setStreaming("");
    setMicError(null);
  }, [stop, toPhase]);

  // Handing the microphone to the other surface, or leaving the page, must not
  // leave a voice talking to an empty room.
  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);
  useEffect(() => () => stopSpeaking(), []);

  return {
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
  };
}
