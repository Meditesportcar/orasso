// Morceaux de Mon profil (lot 40, prototype `s-me` ; lot C2b ; lot M5 : maquette 7.2 « Mon profil désencombré »).
// L'en-tête compact (avatar, pseudo, grade, QR de compte en icône), « Ma saison » (points et passeport en un bloc), le
// crew en une ligne, « Changer de casquette » (une phrase, chaque casquette avec son icône, son nom simple et ce qu'elle
// ouvre, l'active marquée), la feuille « Créer » et les réglages en lignes groupées (`.setlist` de la maquette).
import { Icon, type IconName, initialsOf, OrgLogo, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  adminAppLabels,
  capLabels,
  gradeLabels,
  type MyPoints,
  type MyStaffEvent,
  mediaAppLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CrewDot, Num } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { type AppPersonaEntry, isActive, personaOfEntry, tabHref } from "@/lib/personaModel";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";

const { space1, space2, space3 } = tokens.spacing;
const { radiusLg } = tokens.radius;

/**
 * Une ligne `.cap` (prototype `s-me`) : carré d'icône 44 px, titre 800, sous-titre en casse normale, et à droite une
 * coche, une pastille moutarde ou ›. `selected` = bord moutarde de 2 px (`.cap.on`).
 */
export function HubRow({
  lead,
  title,
  caption,
  trailing,
  onPress,
  selected,
  testID,
  accessibilityLabel,
}: {
  lead: ReactNode;
  title: string;
  caption?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { t } = useTheme();
  const body = (
    <View
      style={[
        styles.row,
        { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard },
        selected && { borderColor: t.color.accent },
      ]}
    >
      {lead}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={t.color.ink} style={styles.rowTitle}>
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" color={t.color.inkMuted} style={styles.rowCaption}>
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="next" size={20} color={t.color.ink} /> : null)}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={accessibilityLabel ?? (caption ? `${title}, ${caption}` : title)}
      onPress={onPress}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

/** Carré d'icône d'une ligne (`.cap .cic` : 44 px, rayon 13, fond `--card-2`). */
export function RowIcon({ name }: { name: IconName }) {
  const { t } = useTheme();
  return (
    <View style={[styles.icon, { backgroundColor: t.color.surfaceRaised }]}>
      <Icon name={name} size={20} color={t.color.ink} />
    </View>
  );
}

/** Le logo d'une casquette (structure, fiche pro…) : `OrgLogo` du socle (rond avec l'image, sinon initiales). */
function EntryLogo({ entry }: { entry: AppPersonaEntry }) {
  return <OrgLogo name={entry.label} logoUrl={mediaSource(entry.logoUrl)?.uri ?? null} size={44} />;
}

/** Le nom simple d'une casquette (maquette 7.2) : « Passionné », « Organisateur · MéditeSportCar ». */
export function capName(entry: AppPersonaEntry): string {
  const name = capLabels.name[entry.kind] ?? entry.kind;
  if (entry.kind === "fan" || entry.kind === "visitor" || entry.kind === "admin") return name;
  return `${name} · ${entry.label}`;
}

const kindIcon: Partial<Record<AppPersonaEntry["kind"], IconName>> = {
  fan: "vehicle",
  visitor: "profile",
  admin: "shield",
};

/** `.on-t` : « ✓ Active » en moutarde, à droite de la casquette active. */
function ActiveMark() {
  const { t } = useTheme();
  return (
    <View style={styles.onT} testID="casquette-active">
      <Icon name="check" size={14} color={t.color.accentText} />
      <Text variant="label" color={t.color.accentText} style={styles.onTText}>
        {capLabels.active}
      </Text>
    </View>
  );
}

/**
 * « Changer de casquette » (maquette 7.2, correction de Damien) : une ligne par casquette (l'appui change de barre
 * d'onglets, la session reste la même), avec ce qu'elle ouvre ; sous l'active, ses accès rapides. Le staff n'est pas
 * une casquette de l'API : il apparaît ici seulement quand la personne a des missions (plus de « Où je suis staff » en
 * double avec Sorties › Staff).
 */
export function CapRows({ staffEvents }: { staffEvents: MyStaffEvent[] }) {
  const { t } = useTheme();
  const router = useRouter();
  const { persona, entries, choose, base } = usePersona();
  // Lot 55 : la ligne du profil média dit s'il est vérifié ; lu seulement quand la casquette existe.
  const hasMedia = entries.some((e) => e.kind === "media");
  const mediaProfile = useApi(async () => (await api.myMediaProfile()).profile, [hasMedia], {
    enabled: hasMedia,
    cacheKey: "media-profile",
  });

  const open = (entry: AppPersonaEntry, route: string) => {
    const next = personaOfEntry(entry);
    choose(next, tabHref(entry.kind, route) ?? undefined);
  };
  const staffWhere = [...new Set(staffEvents.map((s) => s.structure.name))].slice(0, 2).join(", ");

  return (
    <View style={styles.caps}>
      {entries.map((entry) => {
        const active = isActive(persona, entry);
        const caption = entry.assisted ? adminAppLabels.assistanceBannerReadOnly : (capLabels.opens[entry.kind] ?? "");
        const icon = kindIcon[entry.kind];
        const name = capName(entry);
        return (
          <View key={`${entry.kind}:${entry.id}`} style={styles.caps}>
            <HubRow
              lead={icon ? <RowIcon name={icon} /> : <EntryLogo entry={entry} />}
              title={name}
              caption={caption}
              selected={active}
              trailing={
                active ? (
                  <ActiveMark />
                ) : entry.badge > 0 ? (
                  <View style={[styles.cnt, { backgroundColor: t.color.accent }]}>
                    <Text variant="label" color={t.color.accentInk} style={styles.cntText}>
                      {`${entry.badge}`}
                    </Text>
                  </View>
                ) : undefined
              }
              onPress={() => {
                if (!active) choose(personaOfEntry(entry));
              }}
              accessibilityLabel={`${name}, ${active ? "casquette active" : caption}`}
              testID={`casquette-${entry.kind}`}
            />
            {active && entry.kind === "visitor" ? (
              <HubRow
                lead={<RowIcon name="vehicle" />}
                title="Ajouter un véhicule"
                caption="Pour candidater aux rassemblements"
                onPress={() => router.push("/vehicule/nouveau")}
                testID="casquette-quick-vehicle"
              />
            ) : null}
            {active && entry.kind === "pro" ? (
              // Aucun lien de paiement dans l'appli : l'abonnement se gère sur le site.
              <HubRow
                lead={<RowIcon name="grade" />}
                title="Mon abonnement"
                caption="Se gère sur le site orasso.fr"
                testID="casquette-quick-subscription"
              />
            ) : null}
            {active && entry.kind === "provider" ? (
              <HubRow
                lead={<RowIcon name="shop" />}
                title="Ma vitrine"
                caption="Métier, photos, prestation, zone d'intervention"
                onPress={() => open(entry, "vitrine")}
                testID="casquette-quick-showcase"
              />
            ) : null}
            {/* lot 55 : profil média (modifier), accréditations, contenus. */}
            {active && entry.kind === "media" ? (
              <>
                <HubRow
                  lead={<RowIcon name="profile" />}
                  title={mediaAppLabels.casquetteEdit}
                  caption={mediaAppLabels.casquetteEditCaption(
                    mediaProfile.data ? mediaProfile.data.verifiedAt !== null : null,
                  )}
                  onPress={() => router.push("/media/modifier")}
                  testID="casquette-quick-media-profile"
                />
                <HubRow
                  lead={<RowIcon name="press" />}
                  title={mediaAppLabels.casquettePress}
                  caption={mediaAppLabels.casquettePressCaption}
                  onPress={() => open(entry, "presse")}
                  testID="casquette-quick-press"
                />
                <HubRow
                  lead={<RowIcon name="gallery" />}
                  title="Mes contenus"
                  caption="Galeries et liens mis en avant"
                  onPress={() => open(entry, "contenus")}
                  testID="casquette-quick-contents"
                />
              </>
            ) : null}
          </View>
        );
      })}
      {staffEvents.length > 0 ? (
        <HubRow
          lead={<RowIcon name="qr" />}
          title={capLabels.name.staff ?? "Staff"}
          caption={`${capLabels.opens.staff}${staffWhere ? ` · ${staffWhere}` : ""}`}
          onPress={() => {
            const first = staffEvents[0];
            if (staffEvents.length === 1 && first) router.push(`/staff/${first.event.id}`);
            else choose(base, `${tabHref(base.kind, "sorties") ?? "/"}`);
          }}
          testID="casquette-staff"
        />
      ) : null}
    </View>
  );
}

/** `.linkrow` de la maquette : un lien discret « + Devenir organisateur ou pro ». */
export function LinkRow({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
    >
      <Icon name={icon} size={16} color={t.color.accentText} />
      <Text variant="bodyStrong" color={t.color.accentText} style={styles.linkText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Créer une structure, une fiche pro, un profil prestataire (on n'a qu'une fiche pro et qu'un profil prestataire). */
const CREATIONS = [
  {
    kind: "organizer",
    title: "Une structure",
    caption: "Asso, club, circuit : pour organiser des événements",
    icon: "flag",
    path: "/structure/nouvelle",
    tone: "ink",
  },
  {
    kind: "pro",
    title: "Une fiche pro",
    caption: "Garage, prépa, detailing : être trouvé par les passionnés",
    icon: "briefcase",
    path: "/pro-nouvelle",
    tone: "night",
  },
  {
    kind: "provider",
    title: "Un profil prestataire",
    caption: "Food truck, photographe, barbier : candidater aux événements",
    icon: "camera",
    path: "/prestataire/nouveau",
    tone: "accent",
  },
  // D34 (2) : l'option Média reste (l'artefact a tout l'espace média).
  {
    kind: "media",
    title: mediaAppLabels.createTitle,
    caption: mediaAppLabels.createCaption,
    icon: "press",
    path: "/media/nouveau",
    tone: "win",
  },
] as const;

/** La feuille « Créer » (prototype `sh-create` : `.opt` bordées, icône dans un carré coloré, sous-titre `.t-cap`). */
export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const { entries } = usePersona();
  const tones = {
    ink: { bg: t.color.ink, fg: t.color.accent },
    night: { bg: t.color.night, fg: t.color.nightInk },
    accent: { bg: t.color.accent, fg: t.color.accentInk },
    win: { bg: t.color.win, fg: t.color.winInk },
  } as const;
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Créer">
      <Text variant="posterM" color={t.color.ink} style={styles.sheetTitle}>
        Créer
      </Text>
      {CREATIONS.filter((c) => c.kind === "organizer" || !entries.some((e) => e.kind === c.kind)).map((c) => (
        <Pressable
          key={c.kind}
          accessibilityRole="button"
          accessibilityLabel={`${c.title}, ${c.caption}`}
          onPress={() => {
            onClose();
            router.push(c.path);
          }}
          style={[styles.opt, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
          testID={`casquette-create-${c.kind}`}
        >
          <View style={[styles.optIcon, { backgroundColor: tones[c.tone].bg }]}>
            <Icon name={c.icon} size={20} color={tones[c.tone].fg} />
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong" color={t.color.ink} style={styles.rowTitle}>
              {c.title}
            </Text>
            <Text variant="caption" color={t.color.inkMuted}>
              {c.caption}
            </Text>
          </View>
          <Icon name="next" size={20} color={t.color.ink} />
        </Pressable>
      ))}
      <Muted variant="caption">
        Chaque création ajoute une casquette dans Mon profil, avec sa propre barre d'onglets.
      </Muted>
    </AppSheet>
  );
}

/**
 * « Ma saison » (maquette 7.2) : points et passeport en un seul bloc. En tête, la saison et les tampons ; les points en
 * chiffres étroits et le prochain grade ; la jauge ; en pied, le passeport et l'historique des points.
 */
export function SeasonBlock({
  points,
  grade,
  data,
  stamps,
  onPassport,
  onHistory,
}: {
  points: number;
  grade: string;
  data: MyPoints | null;
  /** « 9 tampons, dont 1 rare » ; `null` tant que le passeport n'est pas lu. */
  stamps: string | null;
  onPassport: () => void;
  onHistory: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const next = data?.next;
  const ratio = next && next.threshold > 0 ? Math.min(1, points / next.threshold) : 1;
  return (
    <View
      style={[styles.season, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="profil-season"
      accessibilityLabel={`${data ? data.season.name : "Saison"}, ${points} points, ${grade}`}
    >
      <View style={styles.between}>
        <Text variant="label" color={c.inkMuted}>
          {data ? `Ma ${data.season.name.toLowerCase()}` : "Ma saison"}
        </Text>
        {stamps ? (
          <Text variant="caption" color={c.inkMuted} style={styles.shrink}>
            {stamps}
          </Text>
        ) : null}
      </View>
      <View style={styles.between}>
        <View style={styles.points}>
          <Num size={34}>{points.toLocaleString("fr-FR")}</Num>
          <Num size={16}>pts</Num>
        </View>
        <Text variant="caption" color={c.inkMuted} style={styles.shrink}>
          {next ? `${gradeLabels[next.grade]} à ${next.threshold.toLocaleString("fr-FR")} pts` : `Grade ${grade}`}
        </Text>
      </View>
      <View
        style={[styles.track, { backgroundColor: c.line }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      >
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: c.accent }]} />
      </View>
      <View style={styles.seasonFoot}>
        <Pressable
          accessibilityRole="link"
          onPress={onPassport}
          testID="profil-passport"
          hitSlop={6}
          style={styles.footLink}
        >
          <Text variant="caption" color={c.ink} style={styles.footText}>
            Mon passeport
          </Text>
          <Icon name="next" size={14} color={c.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={onHistory}
          testID="profil-points-history"
          hitSlop={6}
          style={styles.footLink}
        >
          <Text variant="caption" color={c.ink} style={styles.footText}>
            Historique des points
          </Text>
          <Icon name="next" size={14} color={c.ink} />
        </Pressable>
      </View>
    </View>
  );
}

/** Le crew en une ligne (`.lrow`) : rond aux initiales, nom et membres, ou « Crée ou rejoins un crew ». */
export function CrewLine({
  crew,
  onPress,
}: {
  crew: { name: string; membersCount: number } | null;
  onPress: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const title = crew ? crew.name : "Crée ou rejoins un crew";
  const caption = crew
    ? `Ton crew · ${crew.membersCount} membre${crew.membersCount > 1 ? "s" : ""}`
    : "Sortir à plusieurs, s'inscrire ensemble";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={crew ? `Mon crew, ${crew.name}` : "Mon crew, crée ou rejoins un crew"}
      onPress={onPress}
      testID="profil-crew"
      style={({ pressed }) => [
        styles.lrow,
        { backgroundColor: c.surface, borderColor: c.cardLine },
        pressed && styles.pressed,
      ]}
    >
      <CrewDot initials={crew ? initialsOf(crew.name).slice(0, 2) : "+"} size={38} />
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.ink} style={styles.rowTitle}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.rowCaption}>
          {caption}
        </Text>
      </View>
      <Icon name="next" size={20} color={c.ink} />
    </Pressable>
  );
}

/** Réglages en lignes groupées (`.setlist` / `.setrow` de la maquette 7.2). */
export function SetList({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View
      style={[styles.setList, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
      testID="profil-settings"
    >
      {children}
    </View>
  );
}

export function SetRow({
  icon,
  title,
  caption,
  onPress,
  first,
  tone,
  testID,
}: {
  icon: IconName;
  title: string;
  caption?: string;
  onPress: () => void;
  first?: boolean;
  /** `out` : Se déconnecter, en rouge, sans chevron. */
  tone?: "out";
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const ink = tone === "out" ? c.winText : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption ? `${title}, ${caption}` : title}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.setRow,
        !first && { borderTopWidth: 1, borderTopColor: c.line },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={20} color={tone === "out" ? c.winText : c.inkMuted} />
      <View style={styles.text}>
        <Text variant="bodyStrong" color={ink} style={styles.setTitle}>
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" color={c.inkMuted} style={styles.setCaption}>
            {caption}
          </Text>
        ) : null}
      </View>
      {tone === "out" ? null : <Icon name="next" size={16} color={c.inkMuted} />}
    </Pressable>
  );
}

/**
 * Avatar de l'en-tête compact `.mh .me-av` (maquette 7.2) : carré de 62 px, rayon 18, incliné de −6°, fond rouge (photo
 * du compte si elle existe), initiale en Archivo large italique.
 */
export function HeadAvatar({ url, name }: { url?: string | null; name: string }) {
  const { t } = useTheme();
  const source = mediaSource(url);
  return (
    <View
      style={[styles.meAv, { backgroundColor: t.color.win, boxShadow: t.shadow.shadowCard }]}
      accessibilityElementsHidden
    >
      {source ? (
        <Photo source={source} style={styles.meAvImg} />
      ) : (
        <Text variant="posterL" color={t.color.winInk} style={styles.meAvText}>
          {name.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caps: { gap: space2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: radiusLg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  text: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: "Archivo-ExtraBold" },
  rowCaption: { fontSize: 12.5, lineHeight: 17 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cnt: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  cntText: { fontSize: 12, letterSpacing: 0 },
  onT: { flexDirection: "row", alignItems: "center", gap: 4 },
  onTText: { fontSize: 11, lineHeight: 14 },
  // Tour 2 : cibles d'au moins 44 px (règle d'accessibilité du kit).
  linkRow: { flexDirection: "row", alignItems: "center", gap: space1 + 2, alignSelf: "flex-start", minHeight: 44 },
  linkText: { fontSize: 13.5, lineHeight: 18, fontWeight: "800" },
  pressed: { opacity: 0.8 },
  sheetTitle: { fontSize: 18, lineHeight: 19 },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3 + 2,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  optIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  season: { gap: space2, padding: space3 + 2, borderRadius: radiusLg },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  shrink: { flexShrink: 1, textAlign: "right" },
  points: { flexDirection: "row", alignItems: "baseline", gap: space1 },
  track: { height: 10, borderRadius: 5, overflow: "hidden", flexDirection: "row" },
  fill: { height: 10, borderRadius: 5 },
  seasonFoot: { flexDirection: "row", flexWrap: "wrap", columnGap: space3 + 4, marginVertical: -space2 },
  footLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  footText: { fontSize: 12.5, lineHeight: 17, fontWeight: "700" },
  lrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space2 + 2,
    paddingHorizontal: space3,
    borderRadius: 16,
    borderWidth: 1,
  },
  setList: { borderRadius: 18, overflow: "hidden" },
  setRow: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: 13, paddingHorizontal: 14 },
  setTitle: { fontSize: 14.5, lineHeight: 19, fontWeight: "800" },
  setCaption: { fontSize: 12, lineHeight: 16 },
  meAv: {
    width: 62,
    height: 62,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ skewX: "-6deg" }],
  },
  meAvImg: { width: 62, height: 62 },
  meAvText: { fontSize: 26, lineHeight: 28, transform: [{ skewX: "6deg" }] },
});
