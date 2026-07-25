/**
 * The conversation lives outside React's tree.
 *
 * Medley answers by moving the doctor around — asking "what's outstanding?" can
 * return an action that opens a call. That navigation unmounts the home route,
 * and while the messages were component state, the answer was destroyed by the
 * act of following it. A module-level store survives the route change, so
 * coming back to Medley finds the exchange still there.
 *
 * ponytail: deliberately not a context or a query cache. There is exactly one
 * conversation per session and nothing else needs to read it.
 */

import { useSyncExternalStore } from "react";
import type { ChatMessage } from "./medley-api";

let messages: ChatMessage[] = [];
const listeners = new Set<() => void>();

/** Synchronous read, for the send path that needs the list before a re-render. */
export function getConversation() {
  return messages;
}

function snapshot() {
  return messages;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setConversation(next: ChatMessage[]) {
  messages = next;
  listeners.forEach((listener) => listener());
}

export function clearConversation() {
  setConversation([]);
}

export function useConversation(): ChatMessage[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
