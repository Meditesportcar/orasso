// Page d'un souvenir (lot R7j, maquette R7.10) : la photo masquée de ma voiture (sinon l'affiche), « Il y a un an, jour pour
// jour », « Tu étais à … », la date, mon tampon, « Voir le récap » si je l'ai vécu, et la place du bouton « En story » (R7f4).
// Réponse 404 de l'API (pas mon tampon, pas encore un an) : « Ce souvenir n'est pas disponible », jamais un détail de plus.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { formatDayDate, localDate, type MemoryDetail, memoryLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Stamp } from "@/features/passport/Stamp";
import { MemoryShareButton } from "@/features/share/MemoryShareButton";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { PosterSurface, SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { MemoryPhoto } from "./MemoryPhoto";
import { useTitleFit } from "./useTitleFit";

const { space2, space3, space4 } = tokens.spacing;

export function MemoryScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const memory = useApi(() => api.memoryDetail(eventId), [eventId], {
    enabled: Boolean(eventId),
    cacheKey: `memory.${eventId}`,
  });
  const m = memory.data;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <FlowScreen
      title={memoryLabels.pageTitle}
      onClose={close}
      onRefresh={async () => {
        await memory.reload();
      }}
    >
      {memory.error && !m ? (
        <Notice tone="error" testID="memory-error">
          {memory.error.status === 404 ? memoryLabels.unavailable : memoryLabels.loadError}
        </Notice>
      ) : null}
      {!m && !memory.error ? <Muted variant="body">Chargement…</Muted> : null}
      {m ? <MemoryBody m={m} /> : null}
    </FlowScreen>
  );
}

function MemoryBody({ m }: { m: MemoryDetail }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  // Police du système agrandie : les boutons passent l'un sous l'autre (leurs libellés ne tiennent plus côte à côte).
  const stacked = fontScale >= 1.15;
  const day = formatDayDate(localDate(new Date(m.startsAt)));
  const stampDay = formatDayDate(localDate(new Date(m.stamp.stampedAt)));
  const date = memoryLabels.dateLine(day.charAt(0).toUpperCase() + day.slice(1), m.city);
  const fit = useTitleFit(memoryLabels.headline(m.title), 26, space4);
  // « Jour pour jour » seulement le jour anniversaire ; la page ouverte plus tard donne la date du souvenir.
  const eyebrow = m.anniversary ? memoryLabels.eyebrow(m.yearsAgo) : memoryLabels.eyebrowOn(m.yearsAgo, day);
  return (
    <>
      <PosterSurface style={styles.hero} testID="memory-hero">
        <MemoryPhoto memory={m} height={220} fade />
        <View style={styles.heroBody} onLayout={fit.onLayout}>
          <Text variant="label" color={c.accentText} testID="memory-eyebrow">
            {eyebrow}
          </Text>
          <Text variant="posterXl" color={c.posterInk} style={fit.style} testID="memory-title">
            {memoryLabels.headline(m.title)}
          </Text>
          <Text variant="caption" color={c.posterMuted} testID="memory-date">
            {date}
          </Text>
          {m.vehicleLabel ? (
            <Text variant="caption" color={c.posterMuted} testID="memory-vehicle">
              {memoryLabels.yourCar(m.vehicleLabel)}
            </Text>
          ) : null}
        </View>
      </PosterSurface>

      <View style={[styles.stampTile, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
        <View style={styles.stampText}>
          <Text variant="label" color={c.inkMuted}>
            {memoryLabels.yourStamp}
          </Text>
          <Text variant="body" color={c.ink}>
            {memoryLabels.stampedOn(stampDay)}
          </Text>
        </View>
        <Stamp stamp={m.stamp} size={96} paper={c.surface} testID="memory-stamp" />
      </View>

      <View style={[styles.actions, stacked && styles.actionsStacked]} testID="memory-actions">
        {m.recapAvailable ? (
          <SmButton
            kind="p"
            big
            icon="grade"
            onPress={() => router.push({ pathname: "/recap/[id]", params: { id: m.eventId } })}
            style={stacked ? styles.stretch : styles.grow}
            testID="memory-recap"
          >
            {memoryLabels.seeRecap}
          </SmButton>
        ) : null}
        <SmButton
          kind={m.recapAvailable ? "s" : "p"}
          big
          icon="calendar"
          onPress={() => router.push({ pathname: "/e/[slug]", params: { slug: m.slug } })}
          style={stacked ? styles.stretch : styles.grow}
          testID="memory-event"
        >
          {memoryLabels.seeEvent}
        </SmButton>
      </View>
      <MemoryShareButton memory={m} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, overflow: "hidden" },
  heroBody: { marginTop: -10, paddingHorizontal: space4, paddingBottom: space4 + 2, gap: space2 },
  stampTile: { borderRadius: 18, padding: space3 + 2, flexDirection: "row", alignItems: "center", gap: space3 },
  stampText: { flex: 1, minWidth: 0, gap: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space2 + 2 },
  actionsStacked: { flexDirection: "column", flexWrap: "nowrap" },
  grow: { flex: 1, alignSelf: "stretch" },
  stretch: { alignSelf: "stretch" },
});
