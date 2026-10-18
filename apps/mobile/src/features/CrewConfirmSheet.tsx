// Confirmer ma venue en crew (lot 19) : le règlement de l'événement, la case « J'ai lu le règlement », « Suivre
// l'organisateur » cochée d'office. Rien n'est envoyé à l'organisateur sans cette confirmation (docs/01).
import { Button, CheckboxField, Plate, Text, useTheme } from "@orasso/design-system/native";
import { crewLabels, type MyApplication } from "@orasso/shared";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

export function CrewConfirmSheet({
  app,
  onClose,
  onDone,
}: {
  app: MyApplication | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTheme();
  const [rules, setRules] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccepted(false);
    setFollow(true);
    setError(null);
    setRules(null);
    if (!app) return;
    let alive = true;
    api
      .eventBySlug(app.event.slug)
      .then((e) => alive && setRules(e.rulesText))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [app]);

  return (
    <AppSheet visible={Boolean(app)} onClose={onClose} accessibilityLabel={crewLabels.confirmVenue}>
      {app?.crew ? (
        <>
          <Text variant="title" color={t.color.ink}>
            {crewLabels.confirmTitle(app.crew.name)}
          </Text>
          <Text variant="body" color={t.color.ink}>
            {app.event.title} · {formatDayHour(app.event.startsAt)}
          </Text>
          <Text variant="body" color={t.color.inkMuted}>
            {crewLabels.confirmBody(app.crew.leaderPseudo, app.vehicle?.label ?? null)}
          </Text>
          {app.crew.confirmBefore ? (
            <Text variant="caption" color={t.color.inkMuted}>
              {crewLabels.confirmBefore(formatDayHour(app.crew.confirmBefore))}
            </Text>
          ) : null}
          <Plate>
            <Text variant="body" color={t.color.plateInk}>
              {rules ??
                "L'organisateur n'a pas ajouté de règlement particulier : respecte le voisinage, roule au pas, aucun burn."}
            </Text>
          </Plate>
          <CheckboxField label={crewLabels.confirmRules} checked={accepted} onChange={setAccepted} />
          <CheckboxField
            label="Suivre l'organisation (nouveaux événements, avant-premières)"
            checked={follow}
            onChange={setFollow}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            icon="check"
            loading={busy}
            disabled={!accepted}
            fullWidth
            testID="crew-confirm"
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.confirmCrewVenue(app.id, follow);
                onDone();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {crewLabels.confirmVenue}
          </Button>
          <Button variant="plate" icon="back" disabled={busy} onPress={onClose} fullWidth>
            Plus tard
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}
