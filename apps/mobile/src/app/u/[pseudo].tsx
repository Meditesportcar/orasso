// Profil d'un autre (lot 17, ARCHITECTURE-SUITE § 2.2 et 2.5) : complet pour un compte public ou un ami, réduit
// (pseudo, photo, grade, marque et modèle) pour un compte privé. Jamais la plaque. Réservé aux connectés.
import { Button, Chip, Plate, Text, tokens, useTheme, VehicleCard } from "@orasso/design-system/native";
import { gradeLabels, socialLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { MessageButton } from "@/features/boite/MessageButton";
import { FriendButton } from "@/features/social/FriendButton";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function UserProfile() {
  const { t } = useTheme();
  const router = useRouter();
  const { pseudo } = useLocalSearchParams<{ pseudo: string }>();
  const profile = useApi(() => api.userProfile(pseudo), [pseudo]);
  const p = profile.data;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/explorer"));

  if (!p) {
    return (
      <FlowScreen title={pseudo ?? "Profil"} onClose={close}>
        {profile.error ? (
          <Notice tone="error">
            {profile.error.status === 404 ? "Ce profil n'existe pas ou plus." : profile.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  const isSelf = p.audience === "self";
  return (
    <FlowScreen title={p.pseudo} onClose={close} onRefresh={profile.reload}>
      <Plate style={styles.head} testID="profil" accessibilityLabel={`Profil de ${p.pseudo}`}>
        <View style={styles.headRow}>
          <Avatar url={p.avatarUrl} pseudo={p.pseudo} size={64} />
          <View style={styles.headText}>
            <Text variant="posterL" color={t.color.plateInk}>
              {p.pseudo}
            </Text>
            <View style={styles.chips}>
              <Chip variant="accent" surface="plate">
                {gradeLabels[p.grade]}
              </Chip>
              {p.friendsCount !== null ? (
                <Chip surface="plate">{socialLabels.friendsCount(p.friendsCount)}</Chip>
              ) : null}
              {p.departments && p.departments.length > 0 ? (
                <Chip surface="plate">{p.departments.join(", ")}</Chip>
              ) : null}
            </View>
          </View>
        </View>
        {p.bio ? (
          <Text variant="body" color={t.color.plateInk}>
            {p.bio}
          </Text>
        ) : null}
      </Plate>

      {p.audience === "public_limited" ? <Notice>{socialLabels.privateNotice}</Notice> : null}

      {isSelf ? (
        <Button variant="secondary" icon="profile" onPress={() => router.push("/moi")} fullWidth>
          Modifier mon profil
        </Button>
      ) : (
        <View style={styles.actions}>
          <FriendButton
            state={p.friendship.state}
            requestId={p.friendship.id}
            pseudo={p.pseudo}
            userId={p.userId}
            primary
            onChanged={() => void profile.reload()}
          />
          {/* Messagerie (lot 18) : ami → conversation, sinon demande de contact. Signalement : lot 32 (désactivé). */}
          <View style={styles.row}>
            <MessageButton userId={p.userId} pseudo={p.pseudo} />
            <Button variant="secondary" icon="alert" disabled>
              {socialLabels.reportSoon}
            </Button>
          </View>
        </View>
      )}

      {p.contact ? (
        <>
          <SectionTitle>Coordonnées</SectionTitle>
          <Plate style={styles.block} testID="profil-contact">
            <Text variant="body" color={t.color.plateMuted}>
              Visibles de toi parce qu'il ou elle est inscrit à tes événements.
            </Text>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {[p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || "—"}
            </Text>
            <Text variant="body" color={t.color.plateInk}>
              {p.contact.phone ?? "—"}
            </Text>
            <Text variant="body" color={t.color.plateInk}>
              {p.contact.email ?? "—"}
            </Text>
          </Plate>
        </>
      ) : null}

      <SectionTitle>{socialLabels.vehicles}</SectionTitle>
      {p.vehicles.length === 0 ? <Muted variant="body">{socialLabels.noVehicles}</Muted> : null}
      {p.vehicles.map((v, i) => (
        <Pressable
          key={v.id}
          accessibilityRole="link"
          accessibilityLabel={v.label}
          onPress={() => router.push(`/v/${v.id}`)}
        >
          <VehicleCard
            first={i === 0}
            name={v.label}
            photo={{
              source: mediaSource(v.photoUrl),
              placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`,
            }}
          />
        </Pressable>
      ))}

      {p.upcomingEvents ? (
        <>
          <SectionTitle>{socialLabels.upcomingEvents}</SectionTitle>
          {p.upcomingEvents.length === 0 ? <Muted variant="body">{socialLabels.noUpcoming}</Muted> : null}
          {p.upcomingEvents.map((e) => (
            <Pressable key={e.slug} accessibilityRole="link" onPress={() => router.push(`/e/${e.slug}`)}>
              <Plate style={styles.event}>
                <Text variant="posterS" color={t.color.plateInk}>
                  {e.title}
                </Text>
                <Text variant="meta" color={t.color.plateMuted}>
                  {formatDay(e.startsAt)} · {formatHour(e.startsAt)}
                  {e.city ? ` · ${e.city}` : ""}
                </Text>
              </Plate>
            </Pressable>
          ))}
          {p.pastEvents && p.pastEvents.count > 0 ? (
            <Muted variant="caption">
              {socialLabels.pastEventsCount(p.pastEvents.count)} : {p.pastEvents.titles.join(" · ")}
            </Muted>
          ) : null}
        </>
      ) : null}

      {p.crews ? (
        <>
          <SectionTitle>{socialLabels.crews}</SectionTitle>
          <Muted variant="body">{socialLabels.crewsEmpty}</Muted>
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space3, padding: space3 },
  headRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  headText: { flex: 1, gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  actions: { gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  block: { gap: space1, padding: space3 },
  event: { gap: space1, padding: space3 },
});
