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
  /** 0–1, for the level meter. Silence on screen is indistinguishable from a dead microphone. */
  const [level, setLevel] = useState(0);
  // Only ever true in upload mode: native recognition has no gap between the
  // doctor finishing and the words arriving.
  const [transcribing, setTranscribing] = useState(false);
  // null until the effect has looked. Starting at `false` made the server
  // render "this browser can't hear you", which then flashed away on hydration
  // — a false negative on the primary control.
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  /** Upload mode only: runs for on-screen words, never for the transcript. */
  const preview = useRef<SpeechRecognitionLike | null>(null);
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
    // Scribe first, even in Chrome. The browser's recogniser is faster — it
    // returns words while they're still being spoken — but it mishears
    // accented English and clinical vocabulary, which between them are most of
    // what gets said to this thing. It also ends the turn the moment it thinks
    // a sentence finished, so pausing to think hangs up on you. A second of
    // upload buys a model that does neither.
    //
    // Where a browser recogniser also exists it is still started, but only as
    // a teleprompter: its words appear while the doctor talks and are then
    // thrown away, and Scribe's transcript is the one that gets sent. Watching
    // nothing happen for two seconds is what made this feel broken, and it is
    // a display problem, not an accuracy one.
    if (canRecord()) {
      mode.current = "upload";
      setSupported(true);
      const Preview = recognitionCtor();
      if (Preview) {
        const p = new Preview();
        p.lang = "en-GB";
        p.continuous = true;
        p.interimResults = true;
        p.onresult = (e) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? "";
          if (text.trim()) handlers.current.onPartial?.(text.trim());
        };
        // It gives up on its own after a pause. We are not listening to it for
        // the answer, so just start it again for as long as the mic is open.
        p.onend = () => {
          if (!isListening.current) return;
          try {
            p.start();
          } catch {
            // Already running, or the engine is gone. Partials are optional.
          }
        };
        p.onerror = null;
        preview.current = p;
      }
      return () => {
        recording.current?.cancel();
        recording.current = null;
        stopPreview();
      };
    }

    const Ctor = recognitionCtor();
    if (!Ctor) {
      mode.current = null;
      setSupported(false);
      return;
    }
    mode.current = "native";
    setSupported(true);

    const r = new Ctor();
    r.lang = "en-GB";
    // Keep listening across pauses. False ends the turn at the first silence,
    // which is the "it stopped listening" complaint.
    r.continuous = true;
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

  const stopPreview = useCallback(() => {
    const p = preview.current;
    if (!p) return;
    const onend = p.onend;
    p.onend = null; // Stop the restart loop before stopping it.
    try {
      p.abort();
    } catch {
      // Not running.
    }
    p.onend = onend;
  }, []);

  const start = useCallback(() => {
    if (isListening.current) return;

    if (mode.current === "upload") {
      setListeningBoth(true);
      setLevel(0);
      try {
        preview.current?.start();
      } catch {
        // Already running. Not worth failing the turn over.
      }
      void startRecording({
        onLevel: setLevel,
        // The doctor stopped talking. Send it rather than making them find a
        // button — `stop()` is what runs the transcript up to Medley.
        onEndpoint: () => stopRef.current(),
      })
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
          stopPreview();
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
      setLevel(0);
      stopPreview();
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

  // The endpoint detector fires from an animation frame, outside React, so it
  // needs a stable handle on the current stop rather than a captured one.
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const toggle = useCallback(() => {
    if (isListening.current) stop();
    else start();
  }, [start, stop]);

  return { listening, transcribing, supported, level, start, stop, toggle };
}

// One voice at a time. `generation` invalidates a reply still being synthesised
// when the doctor interrupts — without it, barging in mid-answer would be
// followed a second later by the answer you barged in on.
let playing: HTMLAudioElement | null = null;
let inFlight: AbortController | null = null;
let generation = 0;

/**
 * Speaks a reply that is still being written.
 *
 * Medley's answer streams in, so waiting for the last word before sending the
 * first one to be synthesised throws away most of the head start. This takes
 * the reply-so-far on every update, speaks each sentence as soon as it is
 * complete, and synthesises the next one while the current is playing — so the
 * doctor hears "Done, calling Stas this afternoon" while "…about the ramipril"
 * is still being generated.
 *
 * `onDone` fires once, after the last sentence has finished playing and the
 * caller has said there is no more text coming. The voice state machine hands
 * the turn back to the microphone on it, so every path must reach it.
 */
export function speakStream(onDone?: () => void) {
  stopSpeaking();
  const mine = ++generation;

  const queue: string[] = [];
  let spokenTo = 0;
  let ended = false;
  let draining = false;
  let finished = false;

  const finish = () => {
    if (finished || mine !== generation) return;
    finished = true;
    onDone?.();
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    while (queue.length && mine === generation) {
      await playChunk(queue.shift()!, mine);
    }
    draining = false;
    if (ended && !queue.length) finish();
  };

  return {
    /** The whole reply so far, not the delta. */
    push(fullText: string) {
      if (mine !== generation) return;
      const boundary = lastSentenceEnd(fullText, spokenTo);
      if (boundary <= spokenTo) return;
      const chunk = fullText.slice(spokenTo, boundary).trim();
      spokenTo = boundary;
      if (chunk) {
        queue.push(chunk);
        void drain();
      }
    },
    /** No more text is coming; speak whatever is left and then finish. */
    end(fullText: string) {
      if (mine !== generation) return;
      ended = true;
      const rest = fullText.slice(spokenTo).trim();
      spokenTo = fullText.length;
      if (rest) queue.push(rest);
      if (queue.length) void drain();
      else if (!draining) finish();
    },
    /** The turn was abandoned — a tool-call preamble, or the doctor cut in. */
    cancel() {
      if (mine !== generation) return;
      queue.length = 0;
      spokenTo = 0;
      ended = false;
    },
  };
}

/** End of the last complete sentence at or after `from`, else `from`. */
export function lastSentenceEnd(text: string, from: number): number {
  const rest = text.slice(from);
  let best = 0;
  // A boundary only counts once something follows it, so "Dr" mid-sentence and
  // a decimal point don't split the line the moment they are typed.
  const boundary = /[.!?…](["')\]]*)(\s)/g;
  for (let m = boundary.exec(rest); m; m = boundary.exec(rest)) {
    best = m.index + m[0].length;
  }
  return from + best;
}

async function playChunk(text: string, mine: number): Promise<void> {
  const controller = new AbortController();
  inFlight = controller;
  try {
    const blob = await fetchSpeech(text, controller.signal);
    if (mine !== generation) return;
    const audio = new Audio(URL.createObjectURL(blob));
    playing = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };
      void audio.play().catch(() => resolve());
    });
  } catch {
    if (mine !== generation) return;
    // ElevenLabs is down or the chunk was refused. The satnav beats silence.
    await new Promise<void>((resolve) => speakWithBrowser(text, resolve));
  }
}

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
