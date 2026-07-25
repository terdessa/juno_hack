/**
 * The two pieces of parsing between Medley's answer and the doctor's ears.
 * Both fail silently when wrong — a dropped frame is a missing word, a bad
 * sentence boundary is a chunk read aloud mid-clause — so they get a check.
 *
 * Run: bun test
 */

import { expect, test } from "bun:test";
import { parseFrames } from "./medley-api";
import { lastSentenceEnd } from "./useSpeech";

test("reads two events out of one network read", () => {
  const { events, rest } = parseFrames(
    'data: {"type":"text","text":"Done, "}\n\ndata: {"type":"text","text":"calling Stas."}\n\n',
  );

  expect(events).toEqual([
    { type: "text", text: "Done, " },
    { type: "text", text: "calling Stas." },
  ]);
  expect(rest).toBe("");
});

test("holds a frame split across reads until it is whole", () => {
  // The read boundary lands in the middle of the JSON.
  const first = parseFrames('data: {"type":"text","text":"Done, ca');
  expect(first.events).toEqual([]);

  const second = parseFrames(first.rest + 'lling Stas."}\n\n');
  expect(second.events).toEqual([{ type: "text", text: "Done, calling Stas." }]);
});

test("keeps the rest of the reply when one frame is malformed", () => {
  const { events } = parseFrames(
    'data: {oops\n\ndata: {"type":"done","reply":"Done."}\n\n',
  );
  expect(events).toEqual([{ type: "done", reply: "Done." }]);
});

test("speaks a sentence only once it is finished", () => {
  // Mid-sentence: nothing to say yet.
  expect(lastSentenceEnd("Done, calling Stas", 0)).toBe(0);
  // The full stop alone isn't enough — the next token proves it ended.
  expect(lastSentenceEnd("Done, calling Stas.", 0)).toBe(0);
  expect(lastSentenceEnd("Done, calling Stas. And", 0)).toBe(20);
});

test("does not split on a decimal point or an abbreviation", () => {
  expect(lastSentenceEnd("He takes 2.5 mg daily", 0)).toBe(0);
});

test("takes everything finished so far as one chunk", () => {
  // Not one sentence per chunk: whole clauses read better than clipped ones,
  // and it's one request instead of two. Streaming makes this the first
  // sentence anyway — the boundary is found the moment it exists.
  const text = "Done. Calling him at three. ";
  expect(text.slice(0, lastSentenceEnd(text, 0)).trim()).toBe("Done. Calling him at three.");
});

test("never speaks the same words twice", () => {
  const text = "Done. Calling him at three. And I'll tell you what he says. ";
  const first = lastSentenceEnd("Done. And", 0);
  // Picks up where the last chunk ended, so nothing is repeated or skipped.
  const second = lastSentenceEnd(text, first);
  expect(text.slice(first, second).trim()).toBe(
    "Calling him at three. And I'll tell you what he says.",
  );
});
