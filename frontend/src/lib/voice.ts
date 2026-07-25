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

/**
 * Records one utterance. Asking for the microphone is what triggers the
 * browser's permission prompt, so this rejects if the doctor declines — the
 * caller is expected to say so rather than appear to be listening.
 */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  const release = () => stream.getTracks().forEach((track) => track.stop());

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
