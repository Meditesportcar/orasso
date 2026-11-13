// Le haut compact de l'onglet Crew (petit lot de fin, partie E, option B « Comme le Profil » choisie par Damien le 13/11,
// maquette `maquettes-crew` B) : la même grammaire que le haut du Profil (`ProfileHead`). À gauche, la vignette carrée de la
// couverture (76 px) avec le logo du crew dans son coin ; la toucher ouvre la couverture en grand avec la description (et
// « Signaler » pour un membre). Au milieu, le nom (il passe à la ligne, jamais tronqué ; ▾ quand j'ai plusieurs crews : il ouvre
// « Mes crews »), « N membres · tu es le chef » et la description sur une ligne avec « plus », qui la déplie sur place avec
// l'Instagram du crew. À droite, pour le chef, Inviter et Réglages empilés (`SideIcon`, comme QR et Réglages du Profil).
import { Icon, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CrewView,
  crewInstagramUrl,
  crewLabels,
  crewPageLabels as L,
  type MyCrew,
  crewTabLabels as T,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { ProfileBio, SideIcon } from "@/features/profil/ProfileHead";
import { ReportButton } from "@/features/ReportSheet";
import { AppSheet } from "@/ui/AppSheet";
import { Overlay } from "@/ui/Overlay";
import { CrewBadge, CrewSwitchSheet } from "./CrewSelector";

const { space2, space3 } = tokens.spacing;
/** Maquette B : `.b-cov { width: 76px }`, `.b-logo { --s: 32px; right/bottom: -6px }` avec un anneau de 3 px au fond de l'écran. */
const THUMB = 76;
const LOGO = 32;
const RING = 3;
const LOGO_OUT = 6;
/** Corps du nom (maquette : `.b-nm .nm { font-size: 19px }`). */
const NAME_SIZE = 19;

/** La couverture du crew dans une boîte de taille donnée : l'image lue par l'adresse protégée, sinon le dégradé du kit. */
function CoverImage({
  crew,
  style,
  testID,
}: {
  crew: Pick<CrewView, "bannerUrl" | "name">;
  style: ViewStyle;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[style, { backgroundColor: c.night, overflow: "hidden" }]} testID={testID}>
      <Photo
        placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
        style={StyleSheet.absoluteFill}
      />
      {crew.bannerUrl ? (
        <CrewPhotoImage
          url={crew.bannerUrl}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityLabel={`Bannière de ${crew.name}`}
        />
      ) : null}
    </View>
  );
}

/** Le lien Instagram du crew (une pastille) ; il sort de l'appli. */
function InstagramChip({ handle, testID }: { handle: string; testID: string }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={() => void Linking.openURL(crewInstagramUrl(handle)).catch(() => undefined)}
      accessibilityRole="link"
      accessibilityLabel={L.instagramA11y(handle)}
      style={[styles.sc, { backgroundColor: c.surface, borderColor: c.line }]}
      testID={testID}
    >
      <Icon name="instagram" size={16} color={c.ink} />
      <Text variant="bodyStrong" color={c.ink} style={styles.scText}>
        {handle}
      </Text>
    </Pressable>
  );
}

export function CrewHead({
  crew: v,
  crews,
  leader,
  member,
  live,
  unread,
  onChoose,
  onInvite,
}: {
  crew: CrewView;
  crews: readonly MyCrew[];
  leader: boolean;
  member: boolean;
  live: boolean;
  /** Messages non lus de la discussion (ligne sous le nom, dans « Mes crews »). */
  unread: number;
  onChoose: (slug: string) => void;
  onInvite: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [cover, setCover] = useState(false);
  const several = crews.length > 1;
  const sub = `${crewLabels.membersCount(v.membersCount)} · ${leader ? T.youLeader : T.youMember}`;
  const nameRow = (
    <View style={styles.nameRow}>
      <Text variant="posterL" color={c.ink} style={styles.name} testID="crew-name">
        {v.name}
      </Text>
      {several ? (
        <View style={styles.chev}>
          <Icon name="down" size={20} color={c.inkMuted} />
        </View>
      ) : null}
    </View>
  );
  const instagram = v.instagram ? <InstagramChip handle={v.instagram} testID="crew-instagram" /> : null;
  return (
    <View style={styles.head} testID="crew-head">
      <Pressable
        onPress={() => setCover(true)}
        accessibilityRole="button"
        accessibilityLabel={T.coverA11y}
        hitSlop={6}
        style={styles.thumb}
        testID="crew-cover-open"
      >
        <CoverImage
          crew={v}
          style={{ width: THUMB, height: THUMB, borderRadius: tokens.radius.radiusMd }}
          testID={v.bannerUrl ? "crew-cover" : undefined}
        />
        <View style={[styles.logo, { backgroundColor: c.ground }]} pointerEvents="none">
          <CrewBadge crew={v} size={LOGO} />
        </View>
      </Pressable>
      <View style={styles.mid}>
        {several ? (
          <Pressable
            onPress={() => setSwitching(true)}
            accessibilityRole="button"
            accessibilityLabel={T.selectorA11y(v.name)}
            testID="crew-selector"
          >
            {nameRow}
          </Pressable>
        ) : (
          <View accessibilityRole="header" accessibilityLabel={v.name} testID="crew-selector-single">
            {nameRow}
          </View>
        )}
        <Text variant="caption" color={c.inkMuted} testID="crew-sub">
          {sub}
        </Text>
        {v.description ? (
          <ProfileBio text={v.description} testID="crew-description" extra={instagram} />
        ) : instagram ? (
          <View style={styles.alone}>{instagram}</View>
        ) : null}
      </View>
      {leader && live ? (
        <View style={styles.side}>
          <SideIcon icon="share" label={L.inviteA11y} onPress={onInvite} testID="crew-invite" />
          <SideIcon
            icon="gear"
            label={L.settingsA11y}
            onPress={() => router.push({ pathname: "/crew/reglages", params: { crew: v.slug } })}
            testID="crew-settings"
          />
        </View>
      ) : null}
      {several ? (
        <CrewSwitchSheet
          crews={crews}
          current={v}
          unread={unread}
          onChoose={onChoose}
          open={switching}
          onClose={() => setSwitching(false)}
        />
      ) : null}
      {/* La couverture en grand, la description et l'Instagram ; « Signaler » y est, pour un membre (plus en bas de l'espace). */}
      <Overlay>
        <AppSheet visible={cover} onClose={() => setCover(false)} accessibilityLabel={v.name}>
          <Text variant="posterM" color={c.ink} accessibilityRole="header">
            {v.name}
          </Text>
          <View style={styles.big}>
            <CoverImage crew={v} style={styles.bigImage} testID="crew-cover-big" />
            <View style={styles.bigLogo}>
              <CrewBadge crew={v} size={46} />
            </View>
          </View>
          <View style={styles.sheetSub}>
            <Text variant="caption" color={c.inkMuted}>
              {crewLabels.membersCount(v.membersCount)}
            </Text>
            {leader ? <Tag tone="acc">{L.youLead}</Tag> : null}
          </View>
          {v.description ? (
            <Text variant="body" color={c.ink} style={styles.sheetBio} testID="crew-cover-description">
              {v.description}
            </Text>
          ) : null}
          {v.instagram ? (
            <View style={styles.alone}>
              <InstagramChip handle={v.instagram} testID="crew-cover-instagram" />
            </View>
          ) : null}
          {member && !leader && live ? <ReportButton look="link" type="crew" id={v.id} /> : null}
        </AppSheet>
      </Overlay>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: space3 },
  thumb: { width: THUMB, height: THUMB },
  logo: {
    position: "absolute",
    right: -(LOGO_OUT + RING),
    bottom: -(LOGO_OUT + RING),
    padding: RING,
    borderRadius: (LOGO + 2 * RING) / 2,
  },
  mid: { flex: 1, minWidth: 0, gap: 2, paddingTop: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  // Le nom passe à la ligne : jamais tronqué, jamais rapetissé sous la taille de la maquette.
  name: { flexShrink: 1, fontSize: NAME_SIZE, lineHeight: NAME_SIZE + 2 },
  chev: { flexShrink: 0 },
  alone: { flexDirection: "row", flexWrap: "wrap", gap: space2, paddingTop: 2 },
  side: { gap: 6 },
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
  big: { position: "relative" },
  bigImage: { height: 150, borderRadius: tokens.radius.radiusLg },
  bigLogo: { position: "absolute", left: 12, bottom: 12 },
  sheetSub: { flexDirection: "row", alignItems: "center", gap: space3 },
  sheetBio: { fontSize: 14, lineHeight: 21 },
});

/**
 * Le nom du crew et « Mes crews » quand le détail du crew n'a pas pu être lu (panne) : le changement de crew reste à un
 * toucher, à partir de la liste de mes crews déjà chargée. Un seul crew : rien.
 */
export function CrewSwitchOnly({
  crews,
  slug,
  onChoose,
}: {
  crews: readonly MyCrew[];
  slug: string;
  onChoose: (slug: string) => void;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const current = crews.find((c) => c.slug === slug);
  if (crews.length < 2 || !current) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={T.selectorA11y(current.name)}
        testID="crew-selector"
        style={styles.nameRow}
      >
        <Text variant="posterL" color={t.color.ink} style={styles.name}>
          {current.name}
        </Text>
        <Icon name="down" size={20} color={t.color.inkMuted} />
      </Pressable>
      <CrewSwitchSheet
        crews={crews}
        current={current}
        unread={0}
        onChoose={onChoose}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
