/**
 * The context and its hooks live apart from the provider component.
 *
 * A module that exports both a component and a hook can't be hot-reloaded by
 * fast refresh: React re-evaluates it, `createContext` produces a *new* context
 * object, and consumers below an already-mounted provider start reading a
 * context nobody is filling. That threw "must be used inside <MedleyProvider>"
 * on every edit, from a tree that was correctly wrapped.
 */

import { createContext, useContext } from "react";
import type { Appointment, CallTask, InboxItem, Patient } from "@/lib/types";

export interface MedleyStore {
  patients: Patient[];
  tasks: CallTask[];
  /** The doctor's own diary, kept separate from what Medley is doing. */
  appointments: Appointment[];
  /** Everything a call left for the doctor. Open items only reach the badge. */
  inbox: InboxItem[];
  patientById: (id: string) => Patient | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export const MedleyContext = createContext<MedleyStore | null>(null);

/** For screens whose whole purpose is the data. Missing provider is a bug. */
export function useMedleyStore(): MedleyStore {
  const store = useContext(MedleyContext);
  if (!store) throw new Error("useMedleyStore must be used inside <MedleyProvider>");
  return store;
}

/**
 * For chrome that decorates the data without depending on it — the app shell
 * shows a live-call strip and a connection warning, and should render the
 * navigation regardless.
 */
export function useMedleyStoreOptional(): MedleyStore | null {
  return useContext(MedleyContext);
}
