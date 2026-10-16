// Casquette Organisateur, Événements (lot 22) : les événements de la structure par statut (brouillons, publiés à venir,
// passés, annulés). Un appui ouvre la page de l'événement côté organisateur ; la création passe par le site (docs/02).
import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, eventFormatLabels, eventOutlookLabels, eventStatusLabels, orgaLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { Linking, Pressable, StyleSheet } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { groupEvents, orgaSitePath, structureSlugOf } from "@/lib/orga";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

function EventRow({ event, onPress }: { event: EventCard; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={event.title} testID="orga-event-row">
      <Plate style={styles.row}>
        <ChipRow>
          <Chip surface="plate">{eventStatusLabels[event.status]}</Chip>
          {event.status === "published" && event.outlook === "uncertain" ? (
            <Chip surface="plate" variant="accent">
              {eventOutlookLabels.uncertain}
            </Chip>
          ) : null}
        </ChipRow>
        <Text variant="posterM" color={c.plateInk}>
          {event.title}
        </Text>
        <Text variant="body" color={c.plateMuted}>
          {formatDayHour(event.startsAt)} · {eventFormatLabels[event.format]}
          {event.city ? ` · ${event.city}` : ""}
        </Text>
        {event.status === "published" && event.capacity !== null ? (
          <Text variant="caption" color={c.plateMuted}>
            {event.remaining === null
              ? `${event.capacity} places`
              : `${event.remaining} place${event.remaining > 1 ? "s" : ""} restante${event.remaining > 1 ? "s" : ""} sur ${event.capacity}`}
          </Text>
        ) : null}
      </Plate>
    </Pressable>
  );
}

export function EventsScreen() {
  const router = useRouter();
  const { me } = useSession();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
  });
  const groups = useMemo(() => groupEvents(events.data ?? [], at), [events.data, at]);
  const slug = structureSlugOf(me?.memberships, structureId);
  const sections: [string, EventCard[]][] = [
    [orgaLabels.eventsGroupUpcoming, groups.upcoming],
    [orgaLabels.eventsGroupDraft, groups.drafts],
    [orgaLabels.eventsGroupPast, groups.past],
    [orgaLabels.eventsGroupCancelled, groups.cancelled],
  ];
  const empty = (events.data ?? []).length === 0;

  return (
    <TabScreen title={orgaLabels.eventsTitle} facts={structureName} onRefresh={events.reload}>
      <OrgaFailure error={events.error} />
      {events.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}
      {empty && !events.error ? (
        <Muted variant="body">{events.loading ? "Chargement…" : orgaLabels.eventsEmpty}</Muted>
      ) : null}
      {sections.map(([title, list]) =>
        list.length === 0 ? null : (
          <Section key={title} title={title}>
            {list.map((event) => (
              <EventRow key={event.id} event={event} onPress={() => router.push(`/evenement/${event.id}`)} />
            ))}
          </Section>
        ),
      )}
      <Muted variant="meta">{orgaLabels.eventsCreateHint}</Muted>
      <Button
        variant="primary"
        icon="add"
        disabled={!slug}
        onPress={() => slug && void Linking.openURL(siteUrl(orgaSitePath(slug, "/nouvel-evenement")))}
        fullWidth
        testID="orga-create-on-site"
      >
        {orgaLabels.eventsCreateOnSite}
      </Button>
    </TabScreen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: space1 + 2, padding: space3, marginBottom: space2 },
});
