// Répondre à une invitation nominative (lot 25) : l'événement, le message de l'organisateur, le règlement, le véhicule
// (imposé par l'invitation, ou à choisir parmi les véhicules admis avec au moins une photo), Accepter ou Refuser.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  eventDaysLabels,
  formatDayDate,
  invitationLabels,
  type ReceivedInvitation,
  type VehicleFull,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

const L = invitationLabels;
const { space2 } = tokens.spacing;

/** Véhicules qui peuvent répondre : actifs, sans transfert de plaque, type admis, au moins une photo. */
export function eligibleVehicles(inv: ReceivedInvitation, vehicles: VehicleFull[]): VehicleFull[] {
  return vehicles.filter(
    (v) =>
      v.status === "active" &&
      !v.plateTransfer &&
      inv.event.admittedVehicleTypes.includes(v.vehicleType) &&
      v.photos.length > 0,
  );
}

export function InvitationSheet({
  invitation,
  onClose,
  onDone,
}: {
  invitation: ReceivedInvitation | null;
  onClose: () => void;
  /** Après une réponse : le message à afficher (retenu, liste d'attente, refus). */
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleFull[] | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  // Lot 26 : jour choisi d'un événement sur plusieurs jours (`undefined` = pas encore touché).
  const [dayChoice, setDayChoice] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setVehicleId(null);
    setDayChoice(undefined);
    setVehicles(null);
    if (!invitation || invitation.vehicle) return;
    let alive = true;
    api
      .vehicles()
      .then((list) => {
        if (!alive) return;
        const ok = eligibleVehicles(invitation, list);
        setVehicles(ok);
        if (ok.length === 1) setVehicleId(ok[0]?.id ?? null);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [invitation]);

  const inv = invitation;
  const needsChoice = Boolean(inv && !inv.vehicle);
  const blocked = needsChoice && vehicles !== null && vehicles.length === 0;
  const days = inv && inv.event.days.length > 1 && inv.event.dayAccess !== "whole" ? inv.event.days : [];
  const dayId = dayChoice !== undefined ? dayChoice : inv?.event.dayAccess === "per_day" ? (days[0]?.id ?? null) : null;

  async function answer(kind: "accept" | "decline") {
    if (!inv) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "decline") {
        await api.declineEventInvitation(inv.id);
        onDone(L.declined);
      } else {
        const res = await api.acceptEventInvitation(
          inv.id,
          inv.vehicle ? undefined : (vehicleId ?? undefined),
          days.length ? dayId : undefined,
        );
        onDone(res.outcome === "accepted" ? L.accepted : L.waitlisted);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppSheet visible={Boolean(inv)} onClose={onClose} accessibilityLabel={L.notifTitle}>
      {inv ? (
        <>
          <Text variant="label" color={t.color.inkMuted}>
            {L.invitedBy(inv.event.structure.name)}
            {inv.event.privateEvent ? ` · ${L.privateBadge}` : ""}
          </Text>
          <Text variant="title" color={t.color.ink}>
            {inv.event.title}
          </Text>
          <Text variant="body" color={t.color.ink}>
            {formatDayHour(inv.event.startsAt)}
            {inv.event.city ? ` · ${inv.event.city}` : ""}
          </Text>
          <Text variant="caption" color={t.color.inkMuted}>
            {L.validUntil(formatDayHour(inv.event.lockAt))}
          </Text>
          {inv.message ? (
            <Plate kind="note">
              <Text variant="body" color={t.color.plateInk}>
                {inv.message}
              </Text>
            </Plate>
          ) : null}
          {days.length ? (
            <View style={styles.choices}>
              <Text variant="label" color={t.color.inkMuted}>
                {eventDaysLabels.chooseDay}
              </Text>
              <View style={styles.wrap}>
                {inv.event.dayAccess === "both" ? (
                  <Chip selected={dayId === null} onPress={() => setDayChoice(null)}>
                    {eventDaysLabels.wholeEvent}
                  </Chip>
                ) : null}
                {days.map((d) => (
                  <Chip key={d.id} selected={dayId === d.id} onPress={() => setDayChoice(d.id)}>
                    {formatDayDate(d.date)}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
          {inv.vehicle ? (
            <Text variant="bodyStrong" color={t.color.ink}>
              {L.invitedVehicle(inv.vehicle.label)}
            </Text>
          ) : (
            <View style={styles.choices}>
              <Text variant="label" color={t.color.inkMuted}>
                {L.chooseVehicle}
              </Text>
              <View style={styles.wrap}>
                {(vehicles ?? []).map((v) => (
                  <Chip key={v.id} selected={vehicleId === v.id} onPress={() => setVehicleId(v.id)}>
                    {v.label}
                  </Chip>
                ))}
              </View>
              {blocked ? (
                <>
                  <Text variant="body" color={t.color.inkMuted}>
                    {L.noEligibleVehicle}
                  </Text>
                  <Button
                    variant="secondary"
                    icon="add"
                    onPress={() => {
                      onClose();
                      router.push("/vehicule/nouveau");
                    }}
                  >
                    {L.addVehicle}
                  </Button>
                </>
              ) : null}
            </View>
          )}
          <Plate>
            <Text variant="body" color={t.color.plateInk}>
              {inv.event.rulesText ??
                "L'organisateur n'a pas ajouté de règlement particulier : respecte le voisinage, roule au pas, aucun burn."}
            </Text>
          </Plate>
          <Text variant="caption" color={t.color.inkMuted}>
            {L.rulesNotice}
          </Text>
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            icon="check"
            loading={busy === "accept"}
            disabled={busy !== null || blocked || (needsChoice && !vehicleId)}
            onPress={() => void answer("accept")}
            fullWidth
            testID="invitation-accept"
          >
            {L.accept}
          </Button>
          <Button
            variant="secondary"
            icon="close"
            loading={busy === "decline"}
            disabled={busy !== null}
            onPress={() => void answer("decline")}
            fullWidth
            testID="invitation-decline"
          >
            {L.decline}
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  choices: { gap: space2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
