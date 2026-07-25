/**
 * The network half of talking to Medley: ElevenLabs, reached through our own
 * Edge Functions so the API key never enters the page.
 *
 * The hook in `useSpeech.ts` decides *when* to listen and speak. This module
 * only knows how to turn text into audio and audio into text.
 */

import { ANON_KEY, FUNCTIONS_URL } from "./supabase";

/** Text to speech. Returns the audio; playback is the caller's problem. */
export async function fetchSpeech(text: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${FUNCTIONS_URL}/speak`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) throw new Error(`speak failed (${response.status})`);
  return response.blob();
}

/** Speech to text, for browsers with no recogniser of their own. */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, "speech.webm");

  const response = await fetch(`${FUNCTIONS_URL}/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}` },
    body: form,
  });

  const body = (await response.json().catch(() => null)) as {
    text?: string;
    message?: string;
  } | null;
  if (!response.ok || !body?.text) {
    throw new Error(body?.message ?? `transcribe failed (${response.status})`);
  }
  return body.text;
}

export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export interface Recording {
  /** Ends the recording, releases the microphone, and returns what was captured. */
  finish: () => Promise<Blob>;
  /** Ends it and throws the audio away. */
  cancel: () => void;
}

export interface RecordingOptions {
  /** Loudness, 0–1, roughly every animation frame. Drives the level meter. */
  onLevel?: (level: number) => void;
  /** The doctor has stopped talking. Fires once. */
  onEndpoint?: () => void;
}

/** Below this the analyser is hearing room tone, not speech. */
const SILENCE_LEVEL = 0.045;
/** Long enough to think mid-sentence, short enough not to feel ignored. */
const SILENCE_MS = 1100;
/** Never endpoint before this much has been said — a cough shouldn't send. */
const MIN_SPEECH_MS = 500;

/**
 * Records one utterance. Asking for the microphone is what triggers the
 * browser's permission prompt, so this rejects if the doctor declines — the
 * caller is expected to say so rather than appear to be listening.
 *
 * It also listens to itself. Having to press stop is a second decision in the
 * middle of a sentence, and every held-open microphone was dead air in front
 * of the doctor; the analyser ends the turn when they stop talking instead.
 */
export async function startRecording(options: RecordingOptions = {}): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // The three that matter for a laptop in a consulting room. Left to itself
    // the recogniser transcribes the room as much as the speaker.
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  const monitor = watchLevel(stream, options);
  const release = () => {
    monitor.stop();
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    finish: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        if (recorder.state === "inactive") recorder.onstop?.(new Event("stop"));
        else recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}

/** Reports loudness and calls `onEndpoint` once the talking stops. */
function watchLevel(stream: MediaStream, options: RecordingOptions) {
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return { stop: () => {} };

  const context = new AudioCtx();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  const startedAt = performance.now();
  let quietSince: number | null = null;
  let spoke = false;
  let raf = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const level = Math.sqrt(sum / samples.length);
    options.onLevel?.(Math.min(1, level * 8));

    const now = performance.now();
    if (level > SILENCE_LEVEL) {
      spoke = true;
      quietSince = null;
    } else if (spoke && now - startedAt > MIN_SPEECH_MS) {
      // Only endpoint after something was actually said. Opening the mic into
      // a silent room must never fire this — that's a hang-up, not a turn.
      quietSince ??= now;
      if (now - quietSince > SILENCE_MS) {
        stopped = true;
        options.onEndpoint?.();
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      void context.close().catch(() => {});
    },
  };
}
