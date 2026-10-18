// Une carte de l'onglet Accès : une candidature avec son statut, ce qu'on peut en faire (mode jour J, se désister,
// accepter une place libérée) et, pour un refus, le motif envoyé par l'organisateur.

import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewLabels, formatDayDate, type MyApplication, refusalReasonLabels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { formatDayHour, formatDuration, formatHour, formatShortDate } from "@/lib/format";
import { ApplicationStatusBadge } from "./StatusOf";

const { space1, space2, space3 } = tokens.spacing;

export function AccessCard({
  app,
  now,
  busy,
  primary,
  onOpen,
  onJourJ,
  onWithdraw,
  onAccept,
  onDecline,
  onConfirmCrew,
  onDeclineCrew,
}: {
  app: MyApplication;
  now: Date;
  busy?: boolean;
  /** Premier bouton principal de l'écran : « Mode jour J » de la première place retenue. */
  primary?: boolean;
  onOpen: () => void;
  onJourJ: () => void;
  onWithdraw: () => void;
  onAccept: () => void;
  onDecline: () => void;
  /** Venue en crew à confirmer (lot 19) : ouvre la feuille de confirmation ; « Je ne viens pas ». */
  onConfirmCrew?: () => void;
  onDeclineCrew?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const offered = app.status === "offered";
  const remaining = app.offerExpiresAt ? new Date(app.offerExpiresAt).getTime() - now.getTime() : 0;
  const details: string[] = [];
  if (app.vehicle) details.push(app.vehicle.label);
  if (app.crew) details.push(`${crewLabels.crew} « ${app.crew.name} »`);
  const awaiting = app.status === "awaiting_member";
  if (awaiting && app.crew?.confirmBefore) {
    details.push(crewLabels.confirmBefore(formatShortDate(app.crew.confirmBefore)).toLowerCase());
  }
  if (app.status === "accepted" && !app.checkedInAt) {
    details.push(`désistement sans pénalité jusqu'au ${formatShortDate(app.withdrawDeadline)}`);
  }
  if (app.checkedInAt) details.push(`entrée enregistrée à ${formatHour(app.checkedInAt)}`);
  if (app.status === "pending") details.push("réponse de l'équipe organisatrice à venir");
  if (app.status === "waitlisted") details.push("tu seras prévenu si une place se libère");
  if (app.status === "refused") {
    const reasons = (app.refusalReasons ?? []).map((r) => refusalReasonLabels[r]).join(", ");
    if (reasons) details.push(`motif : ${reasons.toLowerCase()}`);
  }
  const canWithdraw = app.status === "pending" || app.status === "waitlisted" || app.status === "accepted";

  return (
    <Plate style={[styles.card, offered && { borderColor: c.accent, boxShadow: t.shadow.neonAccentSoft }]}>
      <View style={styles.head}>
        <View style={styles.title}>
          <Text variant="label" color={offered ? c.accent : c.plateMuted}>
            {offered
              ? `Place libérée · accepte avant ${formatDuration(remaining)}`
              : `${app.day ? `${formatDayDate(app.day.date)} · ${formatHour(app.day.startsAt)}` : formatDayHour(app.event.startsAt)}${app.zone ? ` · Zone ${app.zone.code}` : ""}`}
          </Text>
          <Text variant="posterM" color={c.plateInk} onPress={onOpen} accessibilityRole="link">
            {app.event.title}
          </Text>
        </View>
        <ApplicationStatusBadge app={app} />
      </View>
      {details.length > 0 ? (
        <Text variant="body" color={c.plateMuted}>
          {details.join(" · ")}
        </Text>
      ) : null}
      {app.refusalNote ? (
        <Text variant="body" color={c.plateMuted}>
          « {app.refusalNote} »
        </Text>
      ) : null}
      {offered ? (
        <Text variant="body" color={c.plateMuted}>
          Un retenu s'est désisté. Si tu ne réponds pas à temps, la place passe au suivant.
        </Text>
      ) : null}
      {awaiting && app.crew ? (
        <Text variant="body" color={c.plateMuted}>
          {crewLabels.confirmBody(app.crew.leaderPseudo, null)}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {awaiting && onConfirmCrew ? (
          <>
            <Button
              variant="plate"
              icon="check"
              disabled={busy}
              onPress={onConfirmCrew}
              fullWidth
              testID="crew-confirm-open"
            >
              {crewLabels.confirmVenue}
            </Button>
            <Button variant="plate" tone="dashed" icon="close" loading={busy} onPress={onDeclineCrew} fullWidth>
              {crewLabels.notComing}
            </Button>
          </>
        ) : null}
        {offered ? (
          <>
            <Button variant="primary" icon="check" loading={busy} onPress={onAccept} fullWidth>
              J'accepte la place
            </Button>
            <Button variant="plate" tone="dashed" icon="close" disabled={busy} onPress={onDecline} fullWidth>
              Laisser
            </Button>
          </>
        ) : null}
        {app.status === "accepted" && !app.checkedInAt ? (
          <Button variant={primary ? "primary" : "plate"} icon="qr" next onPress={onJourJ} fullWidth>
            Mode jour J
          </Button>
        ) : null}
        {canWithdraw && !app.checkedInAt ? (
          <Button variant="plate" tone="dashed" icon="close" disabled={busy} onPress={onWithdraw} fullWidth>
            Me désister
          </Button>
        ) : null}
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space2 },
  title: { flex: 1, gap: space1 },
  buttons: { gap: space2, marginTop: space1 },
});
