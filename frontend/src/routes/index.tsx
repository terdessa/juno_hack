import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentHome } from "@/components/medley/AgentHome";
import { Shell } from "@/components/medley/Shell";
import { MedleyProvider } from "@/lib/medley-store";
import type { UiAction } from "@/lib/medley-api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Medley — every patient followed up" },
      {
        name: "description",
        content:
          "Tell Medley who to call. It reads the record, writes the questions, phones the patient, and brings back what they said.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();

  // The agent can move the doctor around as part of answering.
  const handleAction = (action: UiAction) => {
    if (action.type === "open_patient") {
      void navigate({ to: "/patients/$patientId", params: { patientId: action.id } });
    }
    if (action.type === "select_task") {
      void navigate({ to: "/calls/$taskId", params: { taskId: action.id } });
    }
    if (action.type === "show_view") {
      const to =
        action.id === "patients" ? "/patients" : action.id === "calendar" ? "/calendar" : "/calls";
      void navigate({ to });
    }
  };

  return (
    <MedleyProvider>
      <Shell>
        <AgentHome onAction={handleAction} />
      </Shell>
    </MedleyProvider>
  );
}
