/**
 * Voice in and out using what the browser already ships — no key, no vendor,
 * no latency budget spent on a round trip.
 *
 * The hook exposes explicit start/stop rather than only a toggle, because a
 * voice-to-voice conversation drives the microphone from a state machine:
 * listen, think, speak, listen again. A toggle can't express that.
 *
 * ponytail: swap the speak() body for ElevenLabs TTS when a key exists; the
 * call sites don't change. Recognition stays native either way — it's local,
 * instant, and free.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// Chrome exposes this prefixed; TypeScript's DOM lib doesn't know it.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | null;
}

interface SpeechOptions {
  /** Fires once per finished utterance. */
  onTranscript: (text: string) => void;
  /** Fires as words are recognised, before the utterance is final. */
  onPartial?: (text: string) => void;
  /** Recognition ended without producing anything — usually silence. */
  onSilence?: () => void;
  /** Denied permission or no microphone. Distinct from silence: unrecoverable. */
  onError?: (reason: string) => void;
}

export function useSpeech({ onTranscript, onPartial, onSilence, onError }: SpeechOptions) {
  const [listening, setListening] = useState(false);
  // null until the effect has looked. Starting at `false` made the server
  // render "this browser can't hear you", which then flashed away on hydration
  // — a false negative on the primary control.
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  // Mirrors `listening` for the callbacks, which would otherwise close over a
  // stale value and leave start/stop unstable.
  const isListening = useRef(false);
  const gotResult = useRef(false);
  // Set when we end the turn ourselves, so hanging up isn't reported as the
  // doctor having said nothing.
  const stoppedByUs = useRef(false);
  const handlers = useRef({ onTranscript, onPartial, onSilence, onError });
  handlers.current = { onTranscript, onPartial, onSilence, onError };

  const setListeningBoth = useCallback((next: boolean) => {
    isListening.current = next;
    setListening(next);
  }, []);

  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const r = new Ctor();
    r.lang = "en-GB";
    r.continuous = false;
    r.interimResults = true;

    r.onresult = (e) => {
      let finalText = "";
      let partialText = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += text;
        else partialText += text;
      }
      if (partialText.trim()) handlers.current.onPartial?.(partialText.trim());
      if (finalText.trim()) {
        gotResult.current = true;
        handlers.current.onTranscript(finalText.trim());
      }
    };

    r.onend = () => {
      setListeningBoth(false);
      if (!gotResult.current && !stoppedByUs.current) handlers.current.onSilence?.();
      stoppedByUs.current = false;
    };

    r.onerror = (e) => {
      setListeningBoth(false);
      const reason = e?.error ?? "unknown";
      // `no-speech` and `aborted` are ordinary turn endings, not failures.
      if (reason === "no-speech" || reason === "aborted") return;
      handlers.current.onError?.(
        reason === "not-allowed" || reason === "service-not-allowed"
          ? "Microphone access is blocked. Allow it in your browser's address bar."
          : "The microphone stopped working. Try again, or type instead.",
      );
    };

    recognition.current = r;

    return () => {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      try {
        r.abort();
      } catch {
        // Already stopped; nothing to do.
      }
    };
  }, [setListeningBoth]);

  const start = useCallback(() => {
    const r = recognition.current;
    if (!r || isListening.current) return;
    gotResult.current = false;
    stoppedByUs.current = false;
    try {
      r.start();
      setListeningBoth(true);
    } catch {
      // start() throws if called while already running.
    }
  }, [setListeningBoth]);

  const stop = useCallback(() => {
    const r = recognition.current;
    if (!r) return;
    stoppedByUs.current = true;
    // abort() rather than stop(): ends the turn now instead of waiting for the
    // engine to decide the phrase is finished.
    try {
      r.abort();
    } catch {
      // Nothing running.
    }
    setListeningBoth(false);
  }, [setListeningBoth]);

  const toggle = useCallback(() => {
    if (isListening.current) stop();
    else start();
  }, [start, stop]);

  return { listening, supported, start, stop, toggle };
}

/**
 * Reads Medley's reply aloud. Resolves when the voice finishes, so a
 * conversation can hand the turn back to the microphone at the right moment.
 */
export function speak(text: string, onDone?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onDone?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = 1.05;
  // Both fire in practice depending on browser; guard against a double call.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
