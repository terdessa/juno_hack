import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchPatients, fetchTasks } from "@/lib/medley-api";
import type { CallTask, Patient } from "@/lib/mock-data";

/**
 * Live dashboard data. Refetches whenever a task or call changes anywhere —
 * which is what makes a finished call appear on screen without a refresh,
 * including one triggered from another device.
 *
 * ponytail: refetching everything on any change is fine at this size. Move to
 * patching rows in place if the patient list ever gets long.
 */
export function useMedley() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [tasks, setTasks] = useState<CallTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextPatients, nextTasks] = await Promise.all([
        fetchPatients(),
        fetchTasks(),
      ]);
      setPatients(nextPatients);
      setTasks(nextTasks);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const channel = supabase
      .channel("medley-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return { patients, tasks, loading, error, reload: load };
}
