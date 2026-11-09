// Page d'un crew vue de l'extérieur : la vitrine (lot R7b2, D38). Lot 19 : fiche, membres, demandes, invitations. Lot C2b :
// écran à affiche (`s-crew`). Lot R5c2 (décisions de Damien du 26/10) : un non-membre voit l'image du crew, sa description,
// l'Instagram, les amis membres et les membres, et « Demander à rejoindre » (la feuille avec un mot pour le chef), puis
// « Demande envoyée à … » et « Annuler la demande ». Lot R7b2 : un membre actif n'est plus ici, son crew vit dans
// l'onglet Crew (Fil, Sorties, Membres, Spots, Discussion) : la page l'y renvoie (`?onglet=` suivi, un lien de
// notification ouvre le bon onglet). Rien d'autre que la vitrine : ni fil, ni sorties, ni garage, ni discussion.
import { departmentChoices, Icon, initialsOf, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewInstagramUrl, crewLabels, fitWideWordSize, crewPageLabels as L } from "@orasso/shared";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { CrewRequestSheet } from "@/features/crews/CrewRequestSheet";
import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { CrewSecHead, FriendsBox, InfoBox, MemberRow, vitrineCaption } from "@/features/crews/page/parts";
import { PosterFlow } from "@/features/event/PosterFlow";
import { ReportButton } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { CrewDot, SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

/**
 * Lot R6-police (« ROUSSILLO / N DRIFT » avec la police du système agrandie) : le nom du crew ne se coupe qu'entre deux
 * mots ; il rapetisse (jusqu'à 14 px) quand son mot le plus large ne tient pas, échelle de police comprise (comme le
 * titre de la fiche). Tant qu'il tient, rien ne change.
 */
function CrewName({ name, color }: { name: string; color: string }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const size = fitWideWordSize(name, width / Math.max(1, fontScale), styles.name.fontSize, 14);
  return (
    <Text
      variant="posterL"
      color={color}
      style={[styles.name, { fontSize: size, lineHeight: size + styles.name.lineHeight - styles.name.fontSize }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {name}
    </Text>
  );
}

export default function CrewScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { slug, onglet } = useLocalSearchParams<{ slug: string; onglet?: string }>();
  const { me } = useSession();
  const crew = useApi(() => api.crewBySlug(slug), [slug]);
  const v = crew.data;
  const member = v?.viewerState === "member" || v?.viewerState === "leader";
  const live = Boolean(v && !v.archived);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await action();
      if (done) setOk(done);
      await crew.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!v) {
    return (
      <FlowScreen title={crewLabels.crew} onClose={close}>
        {crew.error ? (
          <Notice tone="error">
            {crew.error.status === 404 ? "Ce crew n'existe pas ou plus." : crew.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  // Lot R7b2 : un membre actif d'un crew non dissous a son crew dans l'onglet Crew.
  if (member && live) {
    return <Redirect href={{ pathname: "/crew", params: { crew: v.slug, ...(onglet ? { onglet } : {}) } }} />;
  }

  const since = new Date(v.createdAt).getFullYear();
  const friends = v.members.filter((m) => m.friend);
  const requestSheet = (
    <CrewRequestSheet
      crew={asking ? { id: v.id, name: v.name, leaderPseudo: v.leader?.pseudo ?? null } : null}
      onClose={() => setAsking(false)}
      onSent={(next) => {
        setAsking(false);
        crew.setData(next);
      }}
    />
  );

  // Pied fixe : la seule action principale de la vitrine (ou annuler la demande envoyée).
  const footer =
    !member && live ? (
      v.viewerState === "none" ? (
        <SmButton kind="p" big wide icon="crew" onPress={() => setAsking(true)} testID="crew-request">
          {L.requestJoin}
        </SmButton>
      ) : v.viewerState === "requested" ? (
        <SmButton
          kind="g"
          big
          wide
          icon="close"
          disabled={busy}
          onPress={() => me && void run(() => api.removeCrewMember(v.id, me.user.id))}
          testID="crew-request-cancel"
        >
          {L.cancelRequest}
        </SmButton>
      ) : null
    ) : undefined;

  return (
    <PosterFlow
      onClose={close}
      onRefresh={() => crew.reload()}
      overlays={requestSheet}
      footer={footer}
      testID="crew-page"
      hero={
        <View style={styles.hero}>
          <Photo
            placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
            style={StyleSheet.absoluteFill}
          />
          {/* Tour 2 : la bannière est lue par une adresse protégée (session), en mémoire seulement. */}
          {v.bannerUrl ? (
            <CrewPhotoImage
              url={v.bannerUrl}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibilityLabel={`Bannière de ${v.name}`}
            />
          ) : null}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Photo
              placeholder={`linear-gradient(180deg, ${c.night}0d 0%, ${c.night}b3 100%)`}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>
      }
    >
      {/* `.cr-id` : le rond du crew remonte sur la bannière, nom en grand, « Crew · département · N membres · depuis ». */}
      <View style={styles.id} testID="crew" accessibilityLabel={`${crewLabels.crew} ${v.name}`}>
        <View style={[styles.logoRing, { backgroundColor: c.ground }]}>
          {v.logoUrl ? (
            <View style={styles.logoImg}>
              <Photo source={mediaSource(v.logoUrl)} style={StyleSheet.absoluteFill} />
            </View>
          ) : (
            <CrewDot initials={initialsOf(v.name).slice(0, 2)} size={84} />
          )}
        </View>
        <View style={styles.idText}>
          <CrewName name={v.name} color={c.ink} />
          <Text variant="caption" color={c.inkMuted}>
            {L.idLine(departmentName(v.department), v.membersCount, since)}
          </Text>
        </View>
      </View>
      {v.description ? (
        <Text variant="body" color={c.inkMuted} style={styles.bio} testID="crew-description">
          {v.description}
        </Text>
      ) : null}
      {v.instagram || member ? (
        <View style={styles.chips}>
          {member && v.viewerState === "leader" ? <Tag tone="acc">{L.youLead}</Tag> : null}
          {v.instagram ? (
            <Pressable
              onPress={() => v.instagram && void Linking.openURL(crewInstagramUrl(v.instagram)).catch(() => undefined)}
              accessibilityRole="link"
              accessibilityLabel={L.instagramA11y(v.instagram)}
              style={[styles.sc, { backgroundColor: c.surface, borderColor: c.line }]}
              testID="crew-instagram"
            >
              <InstagramGlyph />
              <Text variant="bodyStrong" color={c.ink} style={styles.scText}>
                {v.instagram}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {v.archived ? <Notice>{L.archived}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice>{ok}</Notice> : null}

      {/* Crew dissous : la discussion reste lisible pour ses anciens membres. */}
      {member && v.conversationId ? (
        <SmButton
          kind="s"
          big
          wide
          icon="chat"
          onPress={() => router.push(`/messages/${v.conversationId}`)}
          accessibilityLabel={L.discussionA11y(0)}
          testID="crew-discussion"
        >
          {L.discussion}
        </SmButton>
      ) : null}

      {/* Vitrine (R5.8, sans le garage : décision de Damien) : amis membres, membres, ce qui est réservé, la demande. */}
      <View style={styles.col} testID="crew-vitrine">
        <FriendsBox friends={friends} />
        <CrewSecHead title={L.membersTitle} hint={String(v.membersCount)} />
        {v.members.map((m) => (
          <MemberRow
            key={m.pseudo}
            pseudo={m.pseudo}
            avatarUrl={m.avatarUrl}
            caption={vitrineCaption(m)}
            leader={m.role === "leader"}
            onPress={() => router.push(`/u/${encodeURIComponent(m.pseudo)}`)}
          />
        ))}
        <InfoBox
          icon="lock"
          title={L.membersOnly}
          caption={L.leaderAccepts(v.leader?.pseudo ?? null)}
          testID="crew-members-only"
        />
        {v.viewerState === "requested" ? (
          <InfoBox
            icon="check"
            tone="accent"
            title={L.requestSentTo(v.leader?.pseudo ?? null)}
            caption={L.requestSentHint}
            testID="crew-request-sent"
          />
        ) : null}
        {v.viewerState === "invited" && live ? (
          <View style={styles.actions}>
            <SmButton
              kind="s"
              big
              icon="check"
              style={styles.grow}
              disabled={busy}
              onPress={() => void run(() => api.acceptCrewInvitation(v.id))}
              testID="crew-invitation-accept"
            >
              {crewLabels.acceptInvitation}
            </SmButton>
            <SmButton
              kind="g"
              big
              icon="close"
              disabled={busy}
              onPress={() => void run(() => api.declineCrewInvitation(v.id))}
            >
              {crewLabels.declineInvitation}
            </SmButton>
          </View>
        ) : null}
      </View>

      {/* Signaler (lot 32) : un crew dont on n'est pas le chef. */}
      {v.viewerState !== "leader" && live ? <ReportButton look="link" type="crew" id={v.id} /> : null}
    </PosterFlow>
  );
}

/** « Crew · Pyrénées-Orientales · … » (maquette R5.7) : le nom du département, son numéro s'il est inconnu. */
function departmentName(code: string): string {
  return departmentChoices.find((d) => d.code === code)?.name ?? code;
}

/** Glyphe Instagram du kit, à la taille de la pastille `.r5sc`. */
function InstagramGlyph() {
  const { t } = useTheme();
  return <Icon name="instagram" size={16} color={t.color.ink} />;
}

const styles = StyleSheet.create({
  hero: { height: 190, width: "100%" },
  // Le nom commence sous la bannière (maquette `.cr-id .stack` : padding-top 48 px, plus l'anneau du logo) : sur une
  // photo de bannière, l'encre du thème Sable ne se lirait pas.
  id: { flexDirection: "row", alignItems: "flex-start", gap: space3 + 2, marginTop: -46 },
  logoRing: { borderRadius: 46, padding: 4 },
  logoImg: { width: 84, height: 84, borderRadius: 42, overflow: "hidden" },
  idText: { flex: 1, minWidth: 0, gap: space1, paddingTop: 50, paddingBottom: space1 },
  name: { fontSize: 24, lineHeight: 23 },
  bio: { fontSize: 13.5, lineHeight: 19.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
  sc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  scText: { fontSize: 12.5 },
  actions: { flexDirection: "row", alignItems: "stretch", gap: space2 },
  grow: { flex: 1, minWidth: 0 },
  col: { gap: space3 },
});
