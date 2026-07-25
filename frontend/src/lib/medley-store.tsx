/**
 * Live data for the dashboard, shaped exactly like the mock data it replaces
 * so the view components didn't have to change.
 *
 * Only the provider lives here. The context and its hooks are in
 * `medley-context.ts` so this file exports a component and nothing else, which
 * is what fast refresh needs to preserve the tree across an edit.
 */

import { useMemo, type ReactNode } from "react";
import { useMedley } from "@/hooks/useMedley";
import { MedleyContext, type MedleyStore } from "@/lib/medley-context";

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
