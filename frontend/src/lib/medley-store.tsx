/**
 * Live data for the dashboard, shaped exactly like the mock data it replaces
 * so the view components didn't have to change.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMedley } from "@/hooks/useMedley";
import type { CallTask, Patient } from "@/lib/mock-data";

interface MedleyStore {
  patients: Patient[];
  tasks: CallTask[];
  patientById: (id: string) => Patient | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const MedleyContext = createContext<MedleyStore | null>(null);

export function MedleyProvider({ children }: { children: ReactNode }) {
  const { patients, tasks, loading, error, reload } = useMedley();

  const value = useMemo<MedleyStore>(() => {
    const index = new Map(patients.map((p) => [p.id, p]));
    return {
      patients,
      tasks,
      patientById: (id: string) => index.get(id),
      loading,
      error,
      reload,
    };
  }, [patients, tasks, loading, error, reload]);

  return <MedleyContext.Provider value={value}>{children}</MedleyContext.Provider>;
}

export function useMedleyStore(): MedleyStore {
  const store = useContext(MedleyContext);
  if (!store) throw new Error("useMedleyStore must be used inside <MedleyProvider>");
  return store;
}
