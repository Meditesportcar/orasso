// Onglet Crew sans crew (lot R7b2, maquette R7.11 `cw_none`) : « Pas encore de crew », la recherche (deux lettres au
// moins, pas d'annuaire), « Rejoindre un crew » (le seul bouton principal) et « Créer un crew ». Les invitations reçues
// (ce que l'API sait dire d'une demande en attente) mènent à la vitrine du crew, où l'on accepte ou refuse.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewTabLabels as L, explorerR2Labels as R } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ExSearch } from "@/features/explorer/ExplorerHead";
import { emptyPeopleFilters } from "@/features/explorer/explorerChoice";
import { PeopleSegment } from "@/features/explorer/PeopleSegment";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";
import { CrewBadge } from "./CrewSelector";

const { space2, space3 } = tokens.spacing;

/** Comme l'Explorer : une recherche à partir de deux lettres. */
const MIN_QUERY = 2;

export function NoCrew() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const [q, setQ] = useState("");
  const text = q.trim();
  const searching = text.length >= MIN_QUERY;
  const invitations = useApi(() => api.crewRequests(), []);
  const invited = (invitations.data ?? []).filter((r) => r.kind === "invitation");
  return (
    <View style={styles.col} testID="crew-tab-none">
      <View style={styles.intro}>
        <View style={[styles.icon, { borderColor: c.line }]}>
          <Icon name="crew" size={30} color={c.inkMuted} />
        </View>
        <Text variant="posterL" color={c.ink} style={styles.center} accessibilityRole="header">
          {L.noCrewTitle}
        </Text>
        <Muted variant="body" style={styles.center}>
          {L.noCrewBody}
        </Muted>
      </View>
      <ExSearch value={q} onChange={setQ} placeholder={L.searchPlaceholder} testID="crew-tab-q" />
      {text.length > 0 && !searching ? <Muted variant="caption">{R.tooShort}</Muted> : null}
      {searching ? (
        <PeopleSegment
          q={q}
          where={null}
          show="crews"
          filters={emptyPeopleFilters}
          coin={me?.profile.departments ?? []}
          create={false}
          crewsOnly
        />
      ) : null}
      {invited.length > 0 ? (
        <View style={styles.col} testID="crew-tab-invitations">
          <SectionTitle>{L.invitationsTitle}</SectionTitle>
          {invited.map((r) => (
            <Pressable
              key={r.crew.id}
              onPress={() => router.push(`/crew/${r.crew.slug}`)}
              accessibilityRole="link"
              testID="crew-tab-invitation"
              style={[styles.invite, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
            >
              <CrewBadge crew={r.crew} size={40} />
              <View style={styles.text}>
                <Text variant="bodyStrong" color={c.ink}>
                  {L.invitationFrom(r.crew.name, r.invitedBy ?? null)}
                </Text>
                <Text variant="caption" color={c.inkMuted}>
                  {L.invitationHint}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      <SmButton
        kind="p"
        big
        wide
        icon="search"
        onPress={() =>
          router.push(searching ? { pathname: "/rejoindre-crew", params: { q: text } } : "/rejoindre-crew")
        }
        testID="crew-tab-join"
      >
        {L.join}
      </SmButton>
      <SmButton kind="s" big wide icon="add" onPress={() => router.push("/crew/nouveau")} testID="crew-tab-create">
        {L.create}
      </SmButton>
      <View style={styles.note}>
        <Icon name="info" size={16} color={c.inkMuted} />
        <Muted variant="caption" style={styles.text}>
          {L.noDirectory}
        </Muted>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  intro: { alignItems: "center", gap: space2, paddingVertical: space3 },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
  invite: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2 + 2,
    borderRadius: tokens.radius.radiusLg,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
});
