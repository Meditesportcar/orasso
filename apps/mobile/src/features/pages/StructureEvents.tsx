// L'onglet « Événements » de la page d'une structure (lot R8g) : les événements à venir puis passés d'aujourd'hui (`EventRow`), et
// dessous ce que la page montrait : « À propos » (type, lieu, note des avis, la présentation en entier, site et réseaux) et les
// pros partenaires. Une panne de lecture ne se déguise jamais en « Aucun événement à venir ».
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type EventCard,
  explorerLabels,
  pagesLabels as L,
  type ProCard,
  type StructurePublic,
  structureKindLabels,
} from "@orasso/shared";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { EventRow, ProRow } from "@/features/explorer/rows";
import { SmallButton } from "@/features/sorties/bits";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";

import type { MoreEventsView } from "./useMoreEvents";

const { space1, space3 } = tokens.spacing;

/** « Voir plus » sous une liste ; après un échec, la panne se dit et « Réessayer » relit la même suite (jamais une liste vidée). */
function MoreEvents({
  more,
  label,
  errorText,
  testID,
}: {
  more: MoreEventsView | undefined;
  label: string;
  errorText: string;
  testID: string;
}) {
  if (!more || (more.next === null && !more.failed)) return null;
  return (
    <>
      {more.failed ? (
        <Notice tone="error" testID={`${testID}-error`}>
          {errorText}
        </Notice>
      ) : null}
      <SmallButton
        icon={more.failed ? "undo" : "down"}
        disabled={more.busy}
        onPress={more.onMore}
        testID={more.failed ? `${testID}-retry` : testID}
      >
        {more.failed ? L.readRetry : label}
      </SmallButton>
    </>
  );
}

export function StructureEvents({
  structure: s,
  upcoming,
  past,
  partners,
  upcomingMore,
  pastMore,
}: {
  structure: StructurePublic;
  /** `null` : la lecture n'a pas abouti (ou n'est pas finie) : on ne dit pas « aucun ». */
  upcoming: EventCard[] | null;
  past: EventCard[] | null;
  partners: ProCard[] | null;
  /** « Voir plus » au-delà des 50 à venir et des 12 passés. */
  upcomingMore?: MoreEventsView;
  pastMore?: MoreEventsView;
}) {
  const { t } = useTheme();
  const where = [s.postalCode, s.city].filter(Boolean).join(" ");
  const average = s.rating.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const socials = Object.entries(s.socials).filter(([, url]) => Boolean(url)) as [string, string][];
  return (
    <View style={styles.wrap} testID="structure-events">
      <SectionTitle>{L.eventsNext}</SectionTitle>
      {upcoming && upcoming.length === 0 ? <Muted variant="body">{explorerLabels.structureNoEvents}</Muted> : null}
      {upcoming?.map((e) => (
        <EventRow key={e.id} event={e} hints={false} />
      ))}
      <MoreEvents
        more={upcomingMore}
        label={L.eventsMore}
        errorText={L.eventsReadError}
        testID="structure-upcoming-more"
      />

      {past && past.length > 0 ? (
        <>
          <SectionTitle>{L.eventsPast}</SectionTitle>
          {past.map((e) => (
            <EventRow key={e.id} event={e} hints={false} />
          ))}
          <MoreEvents more={pastMore} label={L.pastMore} errorText={L.pastReadError} testID="structure-past-more" />
        </>
      ) : null}

      <SectionTitle>{L.eventsAbout}</SectionTitle>
      <Plate style={styles.block} testID="structure-about">
        <Text variant="label" color={t.color.plateMuted}>
          {[structureKindLabels[s.kind], where].filter(Boolean).join(" · ")}
        </Text>
        {average ? (
          <Text variant="meta" color={t.color.plateMuted}>{`${average} / 3 · ${s.rating.count} avis`}</Text>
        ) : null}
        {s.description ? (
          <Text variant="body" color={t.color.plateInk}>
            {s.description}
          </Text>
        ) : null}
        {s.website ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(s.website as string).catch(() => undefined)}
          >
            <Text variant="body" color={t.color.plateInk}>
              {s.website}
            </Text>
          </Pressable>
        ) : null}
        {socials.map(([name, url]) => (
          <Pressable
            key={name}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(url).catch(() => undefined)}
          >
            <Text variant="body" color={t.color.plateInk}>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </Text>
          </Pressable>
        ))}
      </Plate>

      {partners && partners.length > 0 ? (
        <View style={styles.wrap} testID="structure-partners">
          <SectionTitle>{L.eventsPartners}</SectionTitle>
          {partners.map((p) => (
            <ProRow key={p.slug} pro={p} hints={false} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  block: { gap: space1, padding: space3 },
});
