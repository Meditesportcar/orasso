// Profil d'un autre (lot 17, ARCHITECTURE-SUITE § 2.2 et 2.5) : complet pour un compte public ou un ami, réduit
// (pseudo, photo, grade, marque et modèle) pour un compte privé. Jamais la plaque. Réservé aux connectés.
// Lot R4c (maquettes 10.2 et R4.6c) : en-tête compact (avatar à gauche, compteurs sur une ligne), « Ajouter en ami »
// principal et « Suivre » secondaire (compte public seulement), le véhicule principal en premier (« ★ Principal »).
import { Button, Plate, Text, tokens, useTheme, VehicleCard } from "@orasso/design-system/native";
import { mainVehicleLabels, socialLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { MessageButton } from "@/features/boite/MessageButton";
import { CrewRowNative } from "@/features/crews/CrewSearch";
import { FollowButton, PublicHead } from "@/features/profil/network";
import { ReportButton } from "@/features/ReportSheet";
import { FriendButton } from "@/features/social/FriendButton";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
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

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

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
      <View testID="profil" accessibilityLabel={`Profil de ${p.pseudo}`}>
        <PublicHead
          p={p}
          actions={
            isSelf ? (
              <Button variant="secondary" icon="profile" onPress={() => router.push("/moi")} fullWidth>
                Modifier mon profil
              </Button>
            ) : (
              <View style={styles.headActions}>
                <View style={styles.grow}>
                  <FriendButton
                    state={p.friendship.state}
                    requestId={p.friendship.id}
                    pseudo={p.pseudo}
                    userId={p.userId}
                    primary
                    onChanged={() => void profile.reload()}
                  />
                </View>
                {/* Compte privé : pas de « Suivre », seulement « Ajouter en ami » (validation R4.6c). */}
                {p.follow.canFollow || p.follow.following ? (
                  <FollowButton
                    pseudo={p.pseudo}
                    following={p.follow.following}
                    onChanged={() => void profile.reload()}
                  />
                ) : null}
              </View>
            )
          }
        />
      </View>
      {p.bio ? (
        <Text variant="body" color={t.color.ink}>
          {p.bio}
        </Text>
      ) : null}

      {p.audience === "public_limited" ? <Notice>{socialLabels.privateNotice}</Notice> : null}

      {isSelf ? null : (
        <View style={styles.actions}>
          {/* Messagerie (lot 18) : ami → conversation, sinon demande de contact. Signaler : lot 32. */}
          <View style={styles.row}>
            <MessageButton userId={p.userId} pseudo={p.pseudo} />
            <ReportButton type="profile" id={p.userId} />
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
            facts={v.main ? `★ ${mainVehicleLabels.tag}` : undefined}
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
          {p.crews.length === 0 ? <Muted variant="body">{socialLabels.crewsEmpty}</Muted> : null}
          {p.crews.map((c) => (
            <CrewRowNative key={c.id} crew={c} onPress={() => router.push(`/crew/${c.slug}`)} />
          ))}
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  headActions: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
  grow: { flex: 1 },
  actions: { gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  block: { gap: space1, padding: space3 },
  event: { gap: space1, padding: space3 },
});
