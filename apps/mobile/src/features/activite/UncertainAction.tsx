// Suggestion météo (lot 28) dans l'Activité : le bouton passe l'événement en Incertain sans quitter l'écran (lot R7c2 :
// repris de l'ancienne ligne de notification de la Boîte).
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { weatherTexts } from "@orasso/shared";
import { useState } from "react";

import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/http";

export function UncertainAction({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") {
    return (
      <Text variant="caption" color={t.color.inkMuted}>
        Passé en Incertain : les inscrits sont prévenus.
      </Text>
    );
  }
  return (
    <>
      <Button
        variant="secondary"
        icon="wait"
        loading={state === "busy"}
        onPress={async () => {
          setState("busy");
          setError(null);
          try {
            await api.setOutlook(eventId, "uncertain");
            setState("done");
          } catch (e) {
            setState("idle");
            setError(
              e instanceof ApiRequestError && e.status === 403
                ? "Active la double authentification (Moi, Sécurité) pour modifier l'événement depuis l'appli."
                : e instanceof Error
                  ? e.message
                  : "Échec, réessaie.",
            );
          }
        }}
      >
        {weatherTexts.suggestionAction}
      </Button>
      {error ? (
        <Text variant="caption" color={t.color.inkMuted} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </>
  );
}
