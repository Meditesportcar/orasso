// Lot R5b (maquettes R5.6 et R5.6b, retour 6 de Damien) : le profil d'un membre et l'aperçu de son propre profil, un
// seul écran. Ordre de Damien : la tête (photo, pseudo, grade, département, crew, description, réseaux, les quatre
// nombres), le bouton unique « Suivre » (lot R6b, D37), « Sa voiture » (le principal en carré pleine largeur, nom jamais
// coupé, catégories), « Prochaine sortie » (un ticket ; « Toi aussi » si la personne qui regarde y va aussi), « Son
// garage » (les autres, deux par ligne, en carré), « Ses sorties » (les autres à venir en lignes courtes) puis « Vu à »
// (ses tampons de la saison). Compte privé non suivi : la tête, les nombres, « Demander à suivre », ses véhicules en marque
// et modèle, et la ligne « Ses photos, ses sorties… sont pour ses abonnés ». Les cartes carrées n'existent que dans ce profil (le `VehicleCard` du
// système reste en bandeau ailleurs). « ⋯ » (signaler) est dans l'en-tête, posé par l'écran.
// Lot R7b1 (D38, maquette R7.12) : même mise en page que mon profil : la photo dans son anneau, les trois nombres, la ligne
// « Partenaires » (lot R7m1), les actions « Suivre » et « Message » côte à côte, puis deux onglets internes, Garage (par défaut :
// « Sa voiture » et « Son garage ») et Sorties (« Prochaine sortie », « Ses sorties », « Vu à »). Compte privé que je ne suis
// pas : les nombres, « Réservé à ses abonnés » et le bouton, ni Garage ni Sorties.
// Lot R8b1 (D40, maquette R8.1 `pr-profil`, option A « Compact ») : le même haut que mon profil (`ProfileHead`) : photo de 72 px, pseudo,
// « Suivre » sur la ligne du grade (petit bouton principal), bio sur une ligne avec « plus », à droite les icônes « Message » et
// « Plus » (signaler) empilées, puis la bande de compteurs avec « partenaires » en 4e compteur ; les onglets sont soulignés
// (« Garage · N », « Sorties »), sans « Garage » pour un profil sans véhicule. Le crew et les réseaux restent sous le haut.
import {
  AvatarRing,
  type AvatarRingState,
  Icon,
  type IconName,
  Photo,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  authorKeyOf,
  explicitProfileTab,
  filledSocials,
  gradeLabels,
  publicProfileLabels as L,
  networkLabels as N,
  publicPreviewLabels as P,
  type ProfileTab,
  type ProfileVehicle,
  profileTabsLabels as PT,
  profileOpenTab,
  profileRingState,
  profileTabFromParam,
  profileTabItems,
  type SocialNetwork,
  socialsLabels,
  socialUrl,
  storyViewerLabels,
  type UserProfileView,
  visibleProfileTab,
  type WithPublications,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { daysUntil } from "@/features/media/model";
import { MessageButton } from "@/features/messages/MessageButton";
import { OfferButton } from "@/features/partnerships/OfferButton";
import { Stamp } from "@/features/passport/Stamp";
import { PublicationsTab } from "@/features/publications/PublicationsTab";
import { openReport } from "@/features/ReportSheet";
import { FollowButton } from "@/features/social/FollowButton";
import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { formatDay, formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { AppSheet } from "@/ui/AppSheet";
import { CrewDot, TagWin } from "@/ui/Kit";
import { AngledTag } from "@/ui/KitTz";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { SecHead } from "@/ui/SecHead";
import { Ticket } from "@/ui/Ticket";
import { PartnersHost } from "./PartnersLine";
import { type BandCell, CounterBand, ProfileHead, SideIcon } from "./ProfileHead";
import { ProfileTabs } from "./ProfileTabs";
import { SetList, SetRow } from "./parts";

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

/**
 * L'anneau des stories de la personne (`stories` de `GET /users/:pseudo`, lot R7f1) : `null` sans story, anneau fin quand
 * tout est vu. Touchable dès qu'il y a une story (lot R7f2) : il ouvre la visionneuse (`/story/u:<compte>`).
 */
function storyRingOf(p: UserProfileView): AvatarRingState {
  return profileRingState(p.stories);
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
  // Lot R8b1 : la feuille « Plus » (signaler) et l'erreur de l'icône « Message ».
  const [moreOpen, setMoreOpen] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  // Lot R7b1 : l'onglet interne (Garage par défaut) ; `?onglet=sorties` ouvre l'autre.
  const { onglet } = useLocalSearchParams<{ onglet?: string }>();
  const limited = p.audience === "public_limited";
  // Lot R8b1 : un profil sans véhicule n'a pas d'onglet « Garage » et s'ouvre sur « Sorties ».
  const hasGarage = p.vehicles.length > 0;
  // Lot R8b2 : le compteur de publications (`null` : liste restreinte, compte privé que je ne suis pas) et l'onglet d'ouverture :
  // « Publications » sauf chez un autre sans aucune publication (« Garage », ou « Sorties » sans véhicule).
  const publications = (p as WithPublications<UserProfileView>).publications;
  const restricted = limited || publications === null;
  const mine = mode === "self";
  const [tab, setTab] = useState<ProfileTab>(
    explicitProfileTab(onglet) ?? profileOpenTab({ mine, hasGarage, publications: restricted ? null : publications }),
  );
  // Le paramètre s’applique à chaque navigation, même avec la même valeur qu’avant : une fois lu, on le retire.
  useEffect(() => {
    if (onglet === undefined) return;
    setTab(profileTabFromParam(onglet));
    router.setParams({ onglet: undefined });
  }, [onglet, router]);
  const shownTab = restricted ? "publications" : visibleProfileTab(tab, hasGarage);
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
  const previewMine = previewAsFollower ? "accepted" : "none";

  // La ligne du grade : le grade, « Te suit », le département (ou « Compte privé »), puis « Suivre » (petit bouton principal).
  const followLine =
    mode === "self" ? null : mode === "preview" ? (
      // Les boutons ne font rien dans l'aperçu : c'est ce que voient les autres. Masqués aussi pour TalkBack (`importantForAccessibility`,
      // Android) comme pour VoiceOver (`accessibilityElementsHidden`, iOS).
      <View
        style={styles.inert}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="preview-actions"
      >
        <FollowButton
          size="line"
          inert
          pseudo={p.pseudo}
          mine={previewMine}
          followsMe={false}
          canFollow
          visibility={p.visibility}
        />
      </View>
    ) : (
      <FollowButton
        size="line"
        pseudo={p.pseudo}
        mine={p.follow.mine}
        followsMe={p.follow.followsMe}
        canFollow={p.follow.canFollow}
        visibility={p.visibility}
        onChanged={() => onChanged?.()}
      />
    );

  const gradeLine = (
    <>
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
      ) : p.departments?.[0] ? (
        <View style={styles.dept}>
          <Icon name="place" size={14} color={c.inkMuted} />
          <Text variant="bodyStrong" color={c.inkMuted} style={styles.deptText}>
            {p.departments[0]}
          </Text>
        </View>
      ) : null}
      {followLine}
    </>
  );

  // À droite : « Message » et « Plus » (signaler) pour un autre ; « Modifier » pour mon profil ouvert par son lien. « Plus » n'existe
  // que s'il ouvre une action (ici : signaler), jamais une icône vide.
  const side =
    mode === "self" ? (
      <SideIcon
        icon="edit"
        label="Modifier mon profil"
        onPress={() => router.push("/reglages/profil")}
        testID="profile-edit"
      />
    ) : mode === "preview" ? (
      <View
        style={[styles.sideCol, styles.inert]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="preview-side"
      >
        {!limited ? <SideIcon icon="chat" label={PT.message} /> : null}
        <SideIcon icon="more" label={PT.more} />
      </View>
    ) : (
      <View style={styles.sideCol} testID="profile-actions">
        <MessageButton userId={p.userId} pseudo={p.pseudo} asIcon onError={setMsgError} sheetInOverlay />
        <SideIcon icon="more" label={PT.more} onPress={() => setMoreOpen(true)} testID="profile-more" />
      </View>
    );

  // La bande de compteurs : les nombres visibles de tout membre connecté ; « partenaires » en 4e, seulement quand il y en a.
  const bandCells = (partners: { count: number | null; names: string; onPress: () => void } | null): BandCell[] => {
    const cells: BandCell[] = (
      [
        ["followers", p.followersCount, N.followers],
        ["following", p.followingCount, N.following],
        ["outings", p.outingsCount, N.outings],
      ] as const
    )
      .filter(([, n]) => n !== null)
      .map(([key, n, label]) => ({
        key,
        value: n as number,
        label: label(n as number),
        accessibilityLabel: `${n} ${label(n as number)}`,
        testID: `public-count-${key}`,
      }));
    // Tour 2 : un nombre inconnu (lecture de mes partenaires en panne, mode « soi ») garde la case : « – », le toucher ouvre « Réessayer ».
    if (partners) {
      cells.push({
        key: "partners",
        value: partners.count,
        label: N.partners(partners.count ?? 2),
        accessibilityLabel:
          partners.count === null
            ? `${N.partners(2)}, ${PT.unknownCount}`
            : `${partners.count} ${N.partners(partners.count)}, ${partners.names}`,
        onPress: partners.onPress,
        testID: "public-count-partners",
      });
    }
    return cells;
  };

  return (
    <View style={styles.page} onLayout={(e) => setW(e.nativeEvent.layout.width)} testID="profil">
      <View style={styles.top}>
        {/* (1) Le haut compact (\`.r8hd.r8A\`). */}
        <ProfileHead
          testID="public-head"
          avatar={
            <AvatarRing
              ring={storyRingOf(p)}
              neon={false}
              size="profile"
              source={mediaSource(p.avatarUrl)}
              name={p.pseudo}
              onPress={
                mode !== "preview" && p.stories.count > 0
                  ? () => router.push({ pathname: "/story/[authorKey]", params: { authorKey: `u:${p.userId}` } })
                  : undefined
              }
              accessibilityLabel={storyViewerLabels.openStories(p.pseudo)}
              testID="profil-story-ring"
            />
          }
          pseudo={p.pseudo}
          pseudoTestID="profile-pseudo"
          line={gradeLine}
          bio={!limited ? p.bio : null}
          bioTestID="profile-bio"
          side={side}
        />
        {/* Les nombres (visibles de tout membre connecté) et « partenaires » : un seul ouvre sa fiche, plusieurs la liste. */}
        <PartnersHost partners={p.partners} mine={mode === "self"}>
          {(cell) => {
            const cells = bandCells(cell);
            return cells.length ? (
              <CounterBand
                cells={cells}
                testID="public-counts"
                accessibilityLabel={cells.map((x) => `${x.value} ${x.label}`).join(", ")}
              />
            ) : null;
          }}
        </PartnersHost>
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
      {!limited ? <Socials p={p} /> : null}

      {/* Lot R7m1 : « Proposer un partenariat », seulement pour un pro vérifié qui regarde (décidé par l'API). */}
      {mode === "live" && p.partnershipOffer ? (
        <OfferButton
          offer={p.partnershipOffer}
          pseudo={p.pseudo}
          vehicles={p.vehicles}
          onChanged={() => onChanged?.()}
        />
      ) : null}
      {mode === "preview" ? <Muted variant="caption">{P.inert}</Muted> : null}
      {msgError ? <Notice tone="error">{msgError}</Notice> : null}
      {topNotice}

      {/* La feuille « Plus » : les actions qui existaient déjà sur ce profil (signaler), dans la zone des feuilles de l'écran. */}
      {mode === "live" ? (
        <Overlay>
          <AppSheet visible={moreOpen} onClose={() => setMoreOpen(false)} accessibilityLabel={PT.moreTitle}>
            <SetList>
              <SetRow
                first
                icon="flag"
                title={PT.reportProfile}
                onPress={() => {
                  setMoreOpen(false);
                  openReport({ type: "profile", id: p.userId });
                }}
                testID="report-open-profile"
              />
            </SetList>
          </AppSheet>
        </Overlay>
      ) : null}

      <>
        {/* Lot R7b1 : onglets internes ; lot R8b1 : soulignés, « Garage · N » ; lot R8b2 : « Publications » (compte privé : lui seul). */}
        <ProfileTabs
          value={shownTab}
          onChange={setTab}
          items={profileTabItems({ hasGarage, restricted })}
          garageCount={p.vehicles.length}
        />
        {shownTab === "publications" ? (
          <PublicationsTab
            authorKey={authorKeyOf("user", p.userId)}
            pseudo={p.pseudo}
            mine={mine}
            total={publications?.count ?? null}
            restricted={restricted}
            follow={
              mode === "live" && p.follow.canFollow
                ? {
                    asked: p.follow.mine === "pending",
                    onAsk: async () => {
                      await api.follow(p.pseudo);
                      onChanged?.();
                    },
                  }
                : undefined
            }
          />
        ) : shownTab === "garage" ? (
          <>
            {/* (3) « Sa voiture ». */}
            <SecHead title={L.car} hint={L.carHint} />
            {main ? <HeroVehicle v={main} onOpen={open(main)} /> : <Muted variant="body">{L.noVehicle}</Muted>}

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
          </>
        ) : (
          <>
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
            {p.seenAt?.stamps.length ? (
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
      </>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space3 },
  pressed: { opacity: 0.8 },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  top: { gap: space2 },
  dept: { flexDirection: "row", alignItems: "center", gap: 4 },
  deptText: { fontSize: 13, lineHeight: 16 },
  sideCol: { gap: 4 },
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
