/**
 * Voice in and out.
 *
 * The hook exposes explicit start/stop rather than only a toggle, because a
 * voice-to-voice conversation drives the microphone from a state machine:
 * listen, think, speak, listen again. A toggle can't express that.
 *
 * The two directions are deliberately asymmetric:
 *
 * - **Out** goes to ElevenLabs, because the browser's own synthesiser sounds
 *   like a satnav and this is the voice of a medical practice. Falls back to the
 *   satnav if the request fails, on the grounds that a reply the doctor can hear
 *   beats a silent one.
 * - **In** stays with the browser's recogniser wherever it exists. It runs
 *   locally and returns words *while they are being spoken*; uploading audio to
 *   a better model can only be slower. Browsers without one (Safari, Firefox)
 *   record and upload instead — see `voice.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { canRecord, fetchSpeech, startRecording, transcribeAudio, type Recording } from "./voice";

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
  // Only ever true in upload mode: native recognition has no gap between the
  // doctor finishing and the words arriving.
  const [transcribing, setTranscribing] = useState(false);
  // null until the effect has looked. Starting at `false` made the server
  // render "this browser can't hear you", which then flashed away on hydration
  // — a false negative on the primary control.
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const mode = useRef<"native" | "upload" | null>(null);
  const recording = useRef<Recording | null>(null);
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
      // No local recogniser. Record the utterance and send it to be
      // transcribed — slower, but the alternative here is a dead microphone.
      mode.current = canRecord() ? "upload" : null;
      setSupported(mode.current !== null);
      return () => {
        recording.current?.cancel();
        recording.current = null;
      };
    }
    mode.current = "native";
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
    if (isListening.current) return;

    if (mode.current === "upload") {
      setListeningBoth(true);
      void startRecording()
        .then((session) => {
          // The permission prompt can outlast the doctor's patience; if they
          // gave up while it was open, don't quietly start recording.
          if (!isListening.current) {
            session.cancel();
            return;
          }
          recording.current = session;
        })
        .catch(() => {
          setListeningBoth(false);
          handlers.current.onError?.(
            "Microphone access is blocked. Allow it in your browser's address bar.",
          );
        });
      return;
    }

    const r = recognition.current;
    if (!r) return;
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
    if (mode.current === "upload") {
      const session = recording.current;
      recording.current = null;
      setListeningBoth(false);
      if (!session) return;
      setTranscribing(true);
      void session
        .finish()
        .then((audio) => (audio.size > 0 ? transcribeAudio(audio) : ""))
        .then((text) => {
          if (text.trim()) handlers.current.onTranscript(text.trim());
          else handlers.current.onSilence?.();
        })
        .catch((err: unknown) => {
          handlers.current.onError?.(
            err instanceof Error ? err.message : "Couldn't make out that recording.",
          );
        })
        .finally(() => setTranscribing(false));
      return;
    }

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

  return { listening, transcribing, supported, start, stop, toggle };
}

// One voice at a time. `generation` invalidates a reply still being synthesised
// when the doctor interrupts — without it, barging in mid-answer would be
// followed a second later by the answer you barged in on.
let playing: HTMLAudioElement | null = null;
let inFlight: AbortController | null = null;
let generation = 0;

/**
 * Reads Medley's reply aloud, calling back when the voice finishes so the
 * conversation can hand the turn to the microphone at the right moment.
 *
 * `onDone` fires exactly once on every path, including failure. The state
 * machine in AgentHome is waiting on it to start listening again, and a path
 * that forgets to call it leaves the doctor talking to a screen that stopped
 * paying attention.
 */
export function speak(text: string, onDone?: () => void) {
  stopSpeaking();
  const mine = ++generation;

  let finished = false;
  const finish = () => {
    if (finished || mine !== generation) return;
    finished = true;
    onDone?.();
  };

  const controller = new AbortController();
  inFlight = controller;

  void (async () => {
    try {
      const audio = new Audio(URL.createObjectURL(await fetchSpeech(text, controller.signal)));
      if (mine !== generation) {
        URL.revokeObjectURL(audio.src);
        return;
      }
      playing = audio;
      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        finish();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        finish();
      };
      await audio.play();
    } catch {
      if (mine !== generation) return;
      speakWithBrowser(text, finish);
    }
  })();
}

/** The browser's own synthesiser. Second choice, but always there. */
function speakWithBrowser(text: string, onDone: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onDone();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = 1.05;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  generation++;
  inFlight?.abort();
  inFlight = null;
  if (playing) {
    playing.pause();
    URL.revokeObjectURL(playing.src);
    playing = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
