// Bloc « Mes sorties » de l'Accueil (lot R7a2, maquette R7.4) : les 3 prochaines places en lignes courtes, une souche de
// date à gauche, le titre, le statut en étiquette inclinée ; « Tout voir » mène à Sorties. Toucher une ligne ouvre la fiche
// de l'événement. Aucun bouton principal ici (celui de l'écran est « Mon accès » ou « Voter »).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { BUSINESS_TIMEZONE, type HomeMyOutings, type HomeOuting, homeBlockLabels, outingDetail } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { applicationTag, SkewTag } from "@/features/sorties/bits";
import { SecH } from "../fanBlocks";
import { outingsAt } from "./outingsAt";

export { outingsAt };

const { space2, space3 } = tokens.spacing;

const PARTS = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: BUSINESS_TIMEZONE,
});
/** « SAM », « 14 », « NOV » : les trois lignes de la souche de date. */
export function stubOf(iso: string): { weekday: string; day: string; month: string } {
  const parts = PARTS.formatToParts(new Date(iso));
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").replace(/\./g, "").toUpperCase();
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** Le statut de la place : retenue, en attente, liste d'attente (« Attente · 3e »), billet, ou « En cours ». */
export function outingTag(o: HomeOuting): { label: string; tone: "ink" | "acc" | "line" | "wait" | "win" } {
  if (o.ongoing && (o.status === "accepted" || o.status === "ticket")) return { label: "En cours", tone: "acc" };
  if (o.status === "ticket") return { label: "Billet", tone: "acc" };
  return applicationTag(
    { status: o.status, checkedInAt: o.checkedIn ? "x" : null, waitlistRank: o.waitlistRank },
    true,
  );
}

export function MyOutings({
  data,
  onOpen,
  onAll,
}: {
  data: HomeMyOutings;
  onOpen: (o: HomeOuting) => void;
  onAll: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.wrap} testID="home-my-outings">
      <SecH title={homeBlockLabels.outingsTitle} link={homeBlockLabels.seeAll} onLink={onAll} />
      {data.items.map((o) => {
        const stub = stubOf(o.startsAt);
        const tag = outingTag(o);
        const detail = outingDetail(o);
        return (
          <Pressable
            key={o.key}
            onPress={() => onOpen(o)}
            accessibilityRole="link"
            accessibilityLabel={`${o.title}${detail ? `, ${detail}` : ""}, ${stub.weekday} ${stub.day} ${stub.month}, ${tag.label}`}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
              pressed && styles.pressed,
            ]}
            testID="home-my-outing"
          >
            <View style={[styles.stub, { backgroundColor: c.surfaceRaised }]}>
              <Text variant="label" color={c.inkMuted} style={styles.stubWeek}>
                {stub.weekday}
              </Text>
              <Text variant="numberNarrow" color={c.ink} style={styles.stubDay}>
                {stub.day}
              </Text>
              <Text variant="label" color={c.inkMuted} style={styles.stubWeek}>
                {stub.month}
              </Text>
            </View>
            <View style={styles.titleBox}>
              <Text variant="bodyStrong" color={c.ink} style={styles.title}>
                {o.title}
              </Text>
              {detail ? (
                <Text variant="caption" color={c.inkMuted} style={styles.detail} testID="home-my-outing-detail">
                  {detail}
                </Text>
              ) : null}
            </View>
            <SkewTag tone={tag.tone}>{tag.label}</SkewTag>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: 10, borderRadius: 16 },
  pressed: { opacity: 0.85 },
  stub: { width: 46, paddingVertical: 6, borderRadius: 10, alignItems: "center", gap: 1 },
  stubWeek: { fontSize: 9.5, lineHeight: 12 },
  stubDay: { fontSize: 22, lineHeight: 22 },
  // Un nom d'événement ne se tronque jamais : le titre passe à la ligne, l'étiquette reste à droite.
  titleBox: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14.5, lineHeight: 18 },
  detail: { fontSize: 12, lineHeight: 16 },
});
