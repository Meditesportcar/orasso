// Lot R5b (maquettes R5.6 et R5.6b, retour 6 de Damien) : le profil d'un membre et l'aperçu de son propre profil, un
// seul écran. Ordre de Damien : la tête (photo, pseudo, grade, département, crew, description, réseaux, les quatre
// nombres), le bouton unique « Suivre » (lot R6b, D37), « Sa voiture » (le principal en carré pleine largeur, nom jamais
// coupé, catégories), « Prochaine sortie » (un ticket ; « Toi aussi » si la personne qui regarde y va aussi), « Son
// garage » (les autres, deux par ligne, en carré), « Ses sorties » (les autres à venir en lignes courtes) puis « Vu à »
// (ses tampons de la saison). Compte privé non suivi : la tête, les nombres, « Demander à suivre », ses véhicules en marque
// et modèle, et la ligne « Ses photos, ses sorties… sont pour ses abonnés ». Les cartes carrées n'existent que dans ce profil (le `VehicleCard` du
// système reste en bandeau ailleurs). « Écrire » et « ⋯ » (signaler) sont dans l'en-tête, posés par l'écran.
import {
  Button,
  Icon,
  type IconName,
  Photo,
  Text,
  tokens,
  useTheme,
  WordSafeGroup,
  WordSafeText,
} from "@orasso/design-system/native";
import {
  filledSocials,
  fitWideWordSize,
  followButtonKind,
  gradeLabels,
  publicProfileLabels as L,
  networkLabels as N,
  publicPreviewLabels as P,
  type ProfileVehicle,
  type SocialNetwork,
  socialsLabels,
  socialUrl,
  type UserProfileView,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { daysUntil } from "@/features/media/model";
import { Stamp } from "@/features/passport/Stamp";
import { FollowButton } from "@/features/social/FollowButton";
import { now } from "@/lib/clock";
import { formatDay, formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { CrewDot, Num, TagWin } from "@/ui/Kit";
import { AngledTag } from "@/ui/KitTz";
import { Muted } from "@/ui/Muted";
import { SecHead } from "@/ui/SecHead";
import { Ticket } from "@/ui/Ticket";
import { departmentCaption } from "./network";

const { space1, space2, space3 } = tokens.spacing;

/** `live` : le profil d'un autre ; `self` : le sien par son lien ; `preview` : l'aperçu (boutons inertes). */
export type PublicProfileMode = "live" | "self" | "preview";

const NETWORK_ICON: Record<SocialNetwork, IconName> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  facebook: "facebook",
  snapchat: "snapchat",
};

const TYPE_ICON: Record<ProfileVehicle["vehicleType"], IconName> = { car: "vehicle", moto: "moto", truck: "truck" };

const FOLLOW_ICON = {
  follow: "add",
  follow_back: "add",
  request: "add",
  following: "check",
  requested: "wait",
} as const;
const FOLLOW_LABEL = {
  follow: N.follow,
  follow_back: N.followBack,
  request: N.request,
  following: N.followed,
  requested: N.requested,
} as const;

/** L'avatar de la tête : la photo, sinon l'initiale en rouge, comme dans l'onglet Profil (retour 6 : « DA » contre « D »). */
function HeadFace({ url, pseudo }: { url: string | null; pseudo: string }) {
  const { t } = useTheme();
  const source = mediaSource(url);
  return (
    <View style={[styles.face, { backgroundColor: t.color.win, boxShadow: t.shadow.shadowCard }]}>
      {source ? (
        <Photo source={source} style={StyleSheet.absoluteFill} />
      ) : (
        <Text variant="posterL" color={t.color.winInk} style={styles.faceText}>
          {pseudo.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/** Une photo carrée de véhicule, ou la silhouette (pas de photo montrable). */
function SquarePhoto({ v }: { v: ProfileVehicle }) {
  const { t } = useTheme();
  const source = mediaSource(v.photoUrl);
  return (
    <View style={[styles.square, { backgroundColor: t.color.surfaceRaised }]}>
      {source ? (
        <Photo source={source} style={StyleSheet.absoluteFill} />
      ) : (
        <Icon name={TYPE_ICON[v.vehicleType]} size={40} color={t.color.inkFaint} />
      )}
    </View>
  );
}

/** « Sa voiture » : le principal en carré pleine largeur (`.r5hero`), la pastille « Principale », le nom jamais coupé. */
function HeroVehicle({ v, onOpen }: { v: ProfileVehicle; onOpen?: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole={onOpen ? "link" : undefined}
      accessibilityLabel={v.label}
      disabled={!onOpen}
      onPress={onOpen}
      style={[styles.hero, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="profile-car"
    >
      <View>
        <SquarePhoto v={v} />
        <View style={[styles.mainTag, { backgroundColor: c.accent }]}>
          <Icon name="star" size={13} color={c.accentInk} />
          <Text variant="label" color={c.accentInk} style={styles.mainTagText}>
            {L.mainTag}
          </Text>
        </View>
      </View>
      <View style={styles.heroText}>
        <Text variant="posterM" color={c.ink} style={styles.heroName}>
          {v.label}
        </Text>
        {v.year ? <Muted variant="caption">{String(v.year)}</Muted> : null}
        {v.categories.length ? (
          <View style={styles.cats}>
            {v.categories.map((cat) => (
              <View key={cat} style={[styles.cat, { backgroundColor: c.surfaceRaised }]}>
                <Text variant="label" color={c.ink} style={styles.catText}>
                  {cat}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** « Son garage » : un autre véhicule en carré (`.r5sq`), deux par ligne. */
function SquareVehicle({ v, onOpen }: { v: ProfileVehicle; onOpen?: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole={onOpen ? "link" : undefined}
      accessibilityLabel={v.label}
      disabled={!onOpen}
      onPress={onOpen}
      style={styles.sq}
      testID="profile-garage-vehicle"
    >
      <View style={[styles.sqPhoto, { boxShadow: t.shadow.shadowCard }]}>
        <SquarePhoto v={v} />
      </View>
      <Text variant="posterS" color={t.color.ink} style={styles.sqName}>
        {v.label}
      </Text>
      {v.year ? <Muted variant="caption">{String(v.year)}</Muted> : null}
    </Pressable>
  );
}

/** Les trois nombres (`.r5n4 .r6n3`) : abonnés, abonnements, sorties ; visibles de tout membre connecté. */
function Numbers({ p }: { p: UserProfileView }) {
  const { t } = useTheme();
  const cells: [number | null, (n: number) => string][] = [
    [p.followersCount, N.followers],
    [p.followingCount, N.following],
    [p.outingsCount, N.outings],
  ];
  const shown = cells.filter(([n]) => n !== null) as [number, (n: number) => string][];
  if (!shown.length) return null;
  // Lot R6-police : police agrandie, un libellé ne se coupe jamais ; les trois gardent le même corps.
  return (
    <WordSafeGroup>
      <View
        style={[styles.n4, { backgroundColor: t.color.surface }]}
        accessibilityRole="summary"
        accessibilityLabel={shown.map(([n, label]) => `${n} ${label(n)}`).join(", ")}
        testID="public-counts"
      >
        {shown.map(([n, label], i) => (
          <View key={label(2)} style={[styles.n4Cell, i > 0 && { borderLeftWidth: 1, borderLeftColor: t.color.line }]}>
            <Num size={22}>{String(n)}</Num>
            <WordSafeText
              variant="caption"
              base={styles.n4Label.fontSize}
              color={t.color.inkMuted}
              style={styles.n4Label}
            >
              {label(n)}
            </WordSafeText>
          </View>
        ))}
      </View>
    </WordSafeGroup>
  );
}

/** Les réseaux (`.r5socs`) : pastilles icône + pseudo ; le lien est fabriqué par Orasso (`socialUrl`). */
function Socials({ p }: { p: UserProfileView }) {
  const { t } = useTheme();
  const list = filledSocials(p.socials);
  if (!list.length) return null;
  return (
    <View style={styles.socs} accessibilityLabel={socialsLabels.group} testID="profile-socials">
      {list.map(({ network, handle }) => {
        const url = socialUrl(network, handle);
        return (
          <Pressable
            key={network}
            accessibilityRole="link"
            accessibilityLabel={socialsLabels.link(network, handle)}
            disabled={!url}
            onPress={() => url && void Linking.openURL(url)}
            style={({ pressed }) => [
              styles.soc,
              { backgroundColor: t.color.surface, borderColor: t.color.line },
              pressed && styles.pressed,
            ]}
            testID={`profile-social-${network}`}
          >
            <Icon name={NETWORK_ICON[network]} size={15} color={t.color.ink} />
            <Text variant="bodyStrong" color={t.color.ink} style={styles.socText}>
              {handle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PublicProfile({
  p,
  mode,
  previewAsFollower = false,
  onChanged,
  topNotice,
}: {
  p: UserProfileView;
  mode: PublicProfileMode;
  /** Aperçu « vu par un abonné » : le bouton montre « Abonné » (sinon celui qu'un inconnu verrait). */
  previewAsFollower?: boolean;
  onChanged?: () => void;
  /** Un message sous la tête (erreur de l'en-tête « Écrire »). */
  topNotice?: ReactNode;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [w, setW] = useState(0);
  const [headW, setHeadW] = useState(0);
  const { fontScale } = useWindowDimensions();
  // Un pseudo long rapetisse (jusqu'à 14 px) au lieu de se couper ; l'échelle de police du système compte.
  // Tour 2 : la chasse de chaque signe (« M », « W » dépassent la moyenne), comme le site.
  const pseudoSize = fitWideWordSize(p.pseudo, headW / Math.max(1, fontScale), 24, 14);
  const limited = p.audience === "public_limited";
  const crew = p.crews?.[0];
  const main = p.vehicles.find((v) => v.main) ?? p.vehicles[0];
  const others = p.vehicles.filter((v) => v !== main);
  const next = p.nextOuting;
  const moreOutings = (p.upcomingEvents ?? []).filter((e) => e.slug !== next?.event.slug);
  const open = (v: ProfileVehicle) => (mode === "preview" ? undefined : () => router.push(`/v/${v.id}`));
  const days = next ? daysUntil(next.event.startsAt, now()) : 0;
  // Tampons : trois par ligne dans la largeur de l'écran.
  const stampSize = w > 0 ? Math.floor((w - 2 * space3) / 3) : 96;

  // Aperçu : le bouton qu'un inconnu verrait (« Suivre » ou « Demander à suivre » selon mon réglage), ou « Abonné ».
  const previewKind = previewAsFollower
    ? "following"
    : (followButtonKind({ canFollow: true, mine: "none", followsMe: false, visibility: p.visibility }) ?? "follow");

  const actions =
    mode === "self" ? (
      <Button
        variant="secondary"
        icon="edit"
        onPress={() => router.push("/reglages/profil")}
        fullWidth
        testID="profile-edit"
      >
        Modifier mon profil
      </Button>
    ) : mode === "preview" ? (
      // Les boutons ne font rien dans l'aperçu : c'est ce que voient les autres. Tour 2 (relecture Opus 8) : masqués aussi
      // pour TalkBack (`importantForAccessibility`, Android) comme pour VoiceOver (`accessibilityElementsHidden`, iOS).
      <View
        style={styles.inert}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="preview-actions"
      >
        <View style={styles.acts}>
          <Button
            variant={previewKind === "following" ? "secondary" : "primary"}
            icon={FOLLOW_ICON[previewKind]}
            fullWidth
          >
            {FOLLOW_LABEL[previewKind]}
          </Button>
        </View>
      </View>
    ) : (
      // Lot R6b : un seul bouton pleine largeur (`.r6acts`), « Écrire » et « ⋯ » restent dans l'en-tête de l'écran.
      <View style={styles.acts} testID="profile-actions">
        <FollowButton
          pseudo={p.pseudo}
          mine={p.follow.mine}
          followsMe={p.follow.followsMe}
          canFollow={p.follow.canFollow}
          visibility={p.visibility}
          onChanged={() => onChanged?.()}
        />
      </View>
    );

  return (
    <View style={styles.page} onLayout={(e) => setW(e.nativeEvent.layout.width)} testID="profil">
      {/* (1) La tête (`.r5hd`). */}
      <View style={styles.hd} testID="public-head">
        <HeadFace url={p.avatarUrl} pseudo={p.pseudo} />
        <View style={styles.hdText} onLayout={(e) => setHeadW(e.nativeEvent.layout.width)}>
          <Text
            variant="posterL"
            color={c.ink}
            style={[styles.pseudo, { fontSize: pseudoSize, lineHeight: pseudoSize + 1 }]}
            testID="profile-pseudo"
          >
            {p.pseudo}
          </Text>
          <View style={styles.tags}>
            <TagWin>{gradeLabels[p.grade]}</TagWin>
            {mode === "live" && p.follow.followsMe ? (
              <View style={[styles.followsYou, { backgroundColor: c.surfaceRaised }]} testID="follows-you">
                <Text variant="label" color={c.inkMuted}>
                  {N.followsYou.toUpperCase()}
                </Text>
              </View>
            ) : null}
            {limited ? (
              <View style={styles.privateCap}>
                <Icon name="lock" size={13} color={c.inkMuted} />
                <Text variant="caption" color={c.inkMuted}>
                  {L.privateAccount}
                </Text>
              </View>
            ) : departmentCaption(p.departments?.[0]) ? (
              <Text variant="caption" color={c.inkMuted} style={styles.shrink}>
                {departmentCaption(p.departments?.[0])}
              </Text>
            ) : null}
          </View>
          {!limited && crew ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={L.openCrew(crew.name)}
              disabled={mode === "preview"}
              onPress={() => router.push(`/crew/${crew.slug}`)}
              style={({ pressed }) => [
                styles.crew,
                { backgroundColor: c.surface, borderColor: c.line },
                pressed && styles.pressed,
              ]}
              testID="profile-crew"
            >
              <CrewDot initials={crew.name.slice(0, 2).toUpperCase()} size={22} />
              <Text variant="bodyStrong" color={c.ink} style={styles.crewText}>
                {crew.name}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {!limited && p.bio ? (
        <Text variant="body" color={c.inkMuted} style={styles.bio} testID="profile-bio">
          {p.bio}
        </Text>
      ) : null}
      {!limited ? <Socials p={p} /> : null}
      <Numbers p={p} />

      {/* (2) Le bouton unique « Suivre ». */}
      {actions}
      {mode === "preview" ? <Muted variant="caption">{P.inert}</Muted> : null}
      {topNotice}

      {limited ? (
        <>
          <SecHead title={L.vehiclesPrivate} hint={L.vehiclesPrivateHint} />
          <View style={styles.plist} testID="profile-vehicles-private">
            {p.vehicles.map((v) => (
              <View key={v.id} style={[styles.pitem, { backgroundColor: c.surface }]}>
                <Icon name={TYPE_ICON[v.vehicleType]} size={16} color={c.ink} />
                <Text variant="bodyStrong" color={c.ink} style={styles.grow}>
                  {v.label}
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.note, { backgroundColor: c.surface }]} testID="profile-private-note">
            <Icon name="lock" size={16} color={c.inkMuted} />
            <Text variant="caption" color={c.inkMuted} style={styles.noteText}>
              <Text variant="caption" color={c.ink} style={styles.noteStrong}>
                {N.privateLineStrong}
              </Text>{" "}
              {p.follow.mine === "pending" ? N.privateLineWaiting : N.privateLineAsk}
            </Text>
          </View>
        </>
      ) : (
        <>
          {/* (3) « Sa voiture ». */}
          <SecHead title={L.car} hint={L.carHint} />
          {main ? <HeroVehicle v={main} onOpen={open(main)} /> : <Muted variant="body">{L.noVehicle}</Muted>}

          {/* (4) « Prochaine sortie » : un ticket, et « Toi aussi » pour la personne qui regarde. */}
          {next ? (
            <>
              <SecHead title={L.next} hint={L.nextIn(days)} />
              <Ticket
                date={next.event.startsAt}
                badge={<AngledTag tone="acc">{days <= 0 ? "Jour J" : `J-${days}`}</AngledTag>}
                title={next.event.title}
                detail={[formatHour(next.event.startsAt), next.event.city, next.event.structureName]
                  .filter(Boolean)
                  .join(" · ")}
                onPress={mode === "preview" ? undefined : () => router.push(`/e/${next.event.slug}`)}
                testID="profile-next"
              >
                {next.together ? (
                  <View style={[styles.both, { backgroundColor: c.surfaceRaised }]} testID="profile-together">
                    <Icon name="check" size={14} color={c.accentText} />
                    <Text variant="caption" color={c.ink} style={styles.bothText}>
                      {L.together}
                    </Text>
                  </View>
                ) : null}
              </Ticket>
            </>
          ) : p.upcomingEvents ? (
            // Ses sorties sont visibles mais aucune n'est à venir : on le dit (au lieu d'une section absente).
            <>
              <SecHead title={L.next} />
              <Muted variant="body" testID="profile-next-none">
                {L.noOuting}
              </Muted>
            </>
          ) : null}

          {/* (5) « Son garage » : les autres véhicules, deux par ligne. */}
          {others.length ? (
            <>
              <SecHead title={L.garage} hint={L.garageOthers(others.length)} />
              <View style={styles.grid} testID="profile-garage">
                {others.map((v) => (
                  <SquareVehicle key={v.id} v={v} onOpen={open(v)} />
                ))}
              </View>
            </>
          ) : null}

          {/* (6) « Ses sorties » puis « Vu à ». */}
          {moreOutings.length ? (
            <>
              <SecHead title={L.outings} hint={L.outingsHint(moreOutings.length)} />
              <View style={styles.plist} testID="profile-outings">
                {moreOutings.map((e) => (
                  <Pressable
                    key={e.slug}
                    accessibilityRole="link"
                    accessibilityLabel={`${e.title}, ${formatDay(e.startsAt)}`}
                    disabled={mode === "preview"}
                    onPress={() => router.push(`/e/${e.slug}`)}
                    style={({ pressed }) => [styles.pitem, { backgroundColor: c.surface }, pressed && styles.pressed]}
                  >
                    <Icon name="calendar" size={16} color={c.ink} />
                    <Text variant="bodyStrong" color={c.ink} style={styles.grow}>
                      {e.title}
                    </Text>
                    <Muted variant="caption">{formatDay(e.startsAt)}</Muted>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {p.seenAt && p.seenAt.stamps.length ? (
            <>
              <SecHead title={L.seenAt} hint={L.seenAtHint(p.seenAt.events)} />
              <View style={styles.seen} testID="profile-seen">
                {p.seenAt.stamps.slice(0, 3).map((s) => (
                  <Stamp key={s.id} stamp={s} size={stampSize} paper={c.ground} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space3 },
  pressed: { opacity: 0.8 },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  hd: { flexDirection: "row", alignItems: "center", gap: space3 + 2 },
  face: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  faceText: { fontSize: 28, lineHeight: 30 },
  hdText: { flex: 1, minWidth: 0, gap: 6 },
  // Le pseudo passe à la ligne plutôt que de se couper (identifiants longs sans espace : coupure du système).
  pseudo: { fontSize: 24, lineHeight: 25 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space1 + 2 },
  privateCap: { flexDirection: "row", alignItems: "center", gap: 4 },
  crew: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space1 + 2,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: space2 + 2,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 32,
  },
  crewText: { fontSize: 13, lineHeight: 16, flexShrink: 1 },
  bio: { fontSize: 14, lineHeight: 20 },
  socs: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  soc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space2 + 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  socText: { fontSize: 13, lineHeight: 16 },
  n4: { flexDirection: "row", borderRadius: 14, overflow: "hidden" },
  n4Cell: { flex: 1, alignItems: "center", paddingVertical: space2, paddingHorizontal: 2, gap: 1 },
  n4Label: { fontSize: 11.5, lineHeight: 14, textAlign: "center" },
  // Lot R6b (`.r6acts`) : un seul bouton pleine largeur ; son libellé passe à la ligne ou réduit son corps, jamais coupé.
  acts: { gap: space2 },
  // `.r6tag` : petite pastille majuscule, fond de surface secondaire, texte atténué.
  // Tour 2 (relecture Opus 9) : jetons seulement ; le style « label » (11/14) et 4 px dessus et dessous font 22 px.
  followsYou: {
    paddingVertical: space1,
    paddingHorizontal: space2,
    borderRadius: tokens.radius.radiusSm,
    justifyContent: "center",
  },
  inert: { opacity: 0.6 },
  hero: { borderRadius: 18, overflow: "hidden" },
  square: { width: "100%", aspectRatio: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mainTag: {
    position: "absolute",
    top: space3,
    left: space3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: space2,
    borderRadius: 999,
  },
  mainTagText: { fontSize: 11, lineHeight: 13 },
  heroText: { gap: space1, padding: space3 },
  heroName: { fontSize: 20, lineHeight: 22 },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2, marginTop: 2 },
  cat: { paddingVertical: 3, paddingHorizontal: space2, borderRadius: 6 },
  catText: { fontSize: 10.5, lineHeight: 13 },
  // Dans la rangée des boutons du ticket : jamais plus large que le ticket (la phrase passe à la ligne).
  both: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    flexShrink: 1,
    maxWidth: "100%",
    paddingVertical: 5,
    paddingHorizontal: space2,
    borderRadius: 10,
  },
  bothText: { fontSize: 12, lineHeight: 15, fontWeight: "700", flexShrink: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space3 },
  sq: { width: "48%", gap: 4 },
  sqPhoto: { borderRadius: 14, overflow: "hidden" },
  sqName: { fontSize: 13, lineHeight: 15, marginTop: 2 },
  plist: { gap: space2 },
  pitem: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3, borderRadius: 12 },
  seen: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space2 },
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start", padding: space3, borderRadius: 14 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  noteStrong: { fontSize: 12.5, lineHeight: 17, fontWeight: "800" },
});
