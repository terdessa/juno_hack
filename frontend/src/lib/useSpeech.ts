/**
 * Voice in and out using what the browser already ships — no key, no vendor,
 * no latency budget spent on a round trip.
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
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export function useSpeech(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest callback without restarting recognition on every render.
  const handler = useRef(onTranscript);
  handler.current = onTranscript;

  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setSupported(true);

    const r = new Ctor();
    r.lang = "en-GB";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
        .join(" ")
        .trim();
      if (text) handler.current(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;

    return () => {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      try {
        r.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    };
  }, []);

  const toggle = useCallback(() => {
    const r = recognition.current;
    if (!r) return;
    if (listening) {
      r.stop();
      setListening(false);
    } else {
      try {
        r.start();
        setListening(true);
      } catch {
        // start() throws if called while already running.
      }
    }
  }, [listening]);

  return { listening, supported, toggle };
}

/** Reads Medley's reply aloud so the exchange feels like a conversation. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}
