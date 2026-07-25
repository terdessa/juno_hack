/**
 * Replaying what Medley did to the dashboard.
 *
 * Shared, because the agent now answers from two surfaces and "open his
 * record" has to mean the same thing from either. Two copies of this would
 * drift the first time a route changed.
 */

import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { UiAction } from "./medley-api";

export function useAgentActions() {
  const navigate = useNavigate();

  return useCallback(
    (action: UiAction) => {
      if (action.type === "open_patient") {
        void navigate({ to: "/patients/$patientId", params: { patientId: action.id } });
        return;
      }
      if (action.type === "select_task") {
        void navigate({ to: "/calls/$taskId", params: { taskId: action.id } });
        return;
      }
      if (action.type === "show_view") {
        const to =
          action.id === "patients"
            ? "/patients"
            : action.id === "calendar"
              ? "/calendar"
              : "/calls";
        void navigate({ to });
      }
    },
    [navigate],
  );
}
