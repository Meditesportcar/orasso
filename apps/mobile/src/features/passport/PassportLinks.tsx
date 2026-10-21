// « Prix du public » et « Récaps » de l'onglet Passeport (lot 50, relecture ; plan de l'appli : Passeport — Tampons, Prix
// du public, Récaps). Le vote en cours pour un véhicule pointé, un billet contrôlé ou le staff présent ; les récaps prêts.

import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { passportScreenTexts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { readyRecaps, votableEvents } from "@/features/vote/entries";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { formatShortDate } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";

const { space2 } = tokens.spacing;

export function PassportLinks() {
  const { t } = useTheme();
  const router = useRouter();
  const now = useNow();
  const { upcoming } = useApplications();
  const tickets = useApi(() => api.myTickets(), []);
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  const recaps = useApi(() => api.recaps(), [], { cacheKey: "recaps" });
  const voting = votableEvents({ applications: upcoming, tickets: tickets.data, staff: staff.data }, now);
  const ready = readyRecaps(recaps.data, now);
  return (
    <View style={{ gap: space2 }} testID="passport-links">
      <Text variant="posterM" color={t.color.ink}>
        {passportScreenTexts.votesTitle}
      </Text>
      {voting.length === 0 ? (
        <Muted variant="caption">{passportScreenTexts.votesNone}</Muted>
      ) : (
        voting.map((e) => (
          <Button
            key={e.eventId}
            variant="plate"
            icon="badge"
            next
            fullWidth
            testID="passport-vote"
            onPress={() => router.push(`/vote/${e.eventId}?titre=${encodeURIComponent(e.title)}`)}
          >
            {`${passportScreenTexts.votesTitle} · ${e.title}`}
          </Button>
        ))
      )}
      <Text variant="posterM" color={t.color.ink}>
        {passportScreenTexts.recapsTitle}
      </Text>
      {ready.length === 0 ? (
        <Muted variant="caption">{passportScreenTexts.recapsNone}</Muted>
      ) : (
        ready.map((r) => (
          <Button
            key={r.eventId}
            variant="plate"
            icon="list"
            next
            fullWidth
            testID="passport-recap"
            onPress={() => router.push(`/recap/${r.eventId}`)}
          >
            {`${r.title} · ${formatShortDate(r.startsAt)}`}
          </Button>
        ))
      )}
    </View>
  );
}
