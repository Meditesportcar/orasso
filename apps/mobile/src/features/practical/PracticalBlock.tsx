// Bloc « Pratique » de l'Accueil (lot R8q, maquette R8.12 `pratiqueBlock`) : la station-service et le lavage les plus proches, de moi
// (ma position si je l'ai donnée, sinon ma ville) ou de ma sortie. Le bloc lit `POST /practical` lui-même, quand il est affiché.
// Hors ligne ou source muette : rien de faux, jamais une erreur.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type PracticalChoice as Choice,
  formatKm,
  practicalTexts as L,
  type LatLng,
  nearestOfEach,
  type PracticalData,
  type PracticalKind,
  practicalTitle,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SecH } from "@/features/home/fanBlocks";
import { Seg, SmButton } from "@/ui/Kit";
import { usePracticalPosition } from "./position";
import { PracticalRow, useGoSheet } from "./Row";
import { giveMyPosition, practicalSession, usePracticalSources } from "./usePractical";

const { space2, space3 } = tokens.spacing;

/** Les deux lignes du bloc : la plus proche de chaque sorte, à partir de `from` (la position exacte, sinon l'origine). */
export function blockRows(data: PracticalData, from: LatLng) {
  const nearest = nearestOfEach(data.places, from);
  return (["fuel", "wash"] as const).flatMap((kind: PracticalKind) => {
    const place = nearest[kind];
    return place ? [{ kind, place, title: practicalTitle(place, L.unnamed) }] : [];
  });
}

const heading: Record<PracticalKind, string> = { fuel: L.fuelNearest, wash: L.washNearest };

export function PracticalBlock() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { go, sheet } = useGoSheet();
  const sources = usePracticalSources();
  const { busy } = usePracticalPosition();
  const [choice, setChoice] = useState<Choice>(practicalSession.choice);
  const outingOrigin = sources.outing.data?.origin ?? null;
  // Sans sortie à venir, le sélecteur est masqué et le bloc reste « près de moi ».
  const active: Choice = outingOrigin ? choice : "me";
  const read = active === "outing" ? sources.outing : sources.me;
  const data = read.data;
  // Hors ligne, rien de faux : la dernière réponse de la séance, sinon le bloc n'affiche rien.
  if (!data) return null;
  const from: LatLng | null =
    active === "me" && sources.me.exact
      ? sources.me.exact
      : data.origin
        ? { lat: data.origin.lat, lng: data.origin.lng }
        : null;
  const rows = from ? blockRows(data, from) : [];
  const silent = data.partial && data.places.length === 0;
  const choose = (next: Choice) => {
    practicalSession.choice = next;
    setChoice(next);
  };
  return (
    <View style={styles.wrap} testID="home-practical">
      <SecH
        title={L.title}
        link={L.seeAll}
        onLink={() => router.push((active === "outing" ? "/pratique?ou=sortie" : "/pratique") as never)}
        testID="practical-head"
      />
      {outingOrigin ? (
        <Seg<Choice>
          options={[
            { value: "me", label: L.nearMe },
            { value: "outing", label: L.nearOuting },
          ]}
          value={active}
          onChange={choose}
          wrap
          compact
          maxFontScale={1.12}
          testID="practical-choice"
        />
      ) : null}
      {active === "outing" && data.origin ? (
        <View style={styles.hint}>
          <Icon name="ticket" size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.hintText} testID="practical-hint">
            {L.aroundOuting(data.origin.label)}
          </Text>
        </View>
      ) : null}
      {active === "me" && !sources.me.onPosition ? (
        <View style={styles.hint}>
          <Icon name="place" size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.hintText} testID="practical-hint">
            {data.origin ? L.aroundCity(data.origin.label) : L.noOrigin}
          </Text>
        </View>
      ) : null}
      {silent ? (
        <Text variant="caption" color={c.inkMuted} testID="practical-unavailable">
          {L.unavailable}
        </Text>
      ) : data.origin && rows.length === 0 ? (
        <Text variant="caption" color={c.inkMuted} testID="practical-empty">
          {L.nothingNear}
        </Text>
      ) : (
        <View style={styles.rows}>
          {rows.map(({ kind, place, title }) => (
            <PracticalRow
              key={kind}
              kind={kind}
              title={heading[kind]}
              detail={`${title} · ${formatKm(place.distanceKm)}`}
              onGo={() => go({ title, lat: place.lat, lng: place.lng })}
              testID={`practical-${kind}`}
            />
          ))}
        </View>
      )}
      {read.failed ? (
        <View style={styles.gps}>
          <SmButton kind="s" icon="undo" disabled={read.loading} onPress={read.retry} testID="practical-retry">
            {L.retry}
          </SmButton>
        </View>
      ) : null}
      {active === "me" ? (
        <View style={styles.gps}>
          <SmButton
            kind="s"
            icon="target"
            disabled={busy}
            onPress={() => void giveMyPosition()}
            testID="practical-use-position"
          >
            {sources.me.onPosition ? L.relocate : L.usePosition}
          </SmButton>
        </View>
      ) : null}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  rows: { gap: 8 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  hintText: { flex: 1 },
  gps: { alignItems: "flex-start", paddingTop: space3 - space2 },
});
