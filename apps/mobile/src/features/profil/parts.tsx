// Morceaux de Mon profil (lot 40, prototype `s-me` ; reproduits fidèlement au lot C2b) : les casquettes `.cap`, la
// feuille « Créer » `sh-create`, la carte de saison `.grade`, les tuiles de réglages `.mtile` et l'en-tête `.me-head`.
import { Icon, type IconName, OrgLogo, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { adminAppLabels, gradeLabels, type MyPoints, type MyStaffEvent, mediaAppLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Num } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { type AppPersonaEntry, isActive, personaKindLabels, personaOfEntry, tabHref } from "@/lib/personaModel";
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

/** Le nom d'une casquette dans la liste (prototype `s-me`). */
function titleOf(entry: AppPersonaEntry): string {
  if (entry.kind === "fan") return "Passionné · exposant";
  if (entry.kind === "visitor") return "Profil visiteur";
  return `${personaKindLabels[entry.kind]} · ${entry.label}`;
}

const kindIcon: Partial<Record<AppPersonaEntry["kind"], IconName>> = { fan: "vehicle", visitor: "profile" };

/**
 * « Mes casquettes » : une ligne `.cap` par casquette (l'appui change de barre d'onglets, la session reste la même),
 * puis les accès rapides de la casquette active seulement (prototype : `data-only` du profil affiché), et la ligne
 * « Où je suis staff » (le staff n'est pas une casquette). Sans mission de staff, la ligne ouvre la demande à
 * rejoindre une équipe (l'ancienne ligne « Devenir staff d'une structure », audit § 5.2).
 */
export function PersonaRows({
  staffEvents,
  onStaffRequest,
}: {
  staffEvents: MyStaffEvent[];
  onStaffRequest: () => void;
}) {
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

  return (
    <View style={styles.caps}>
      {entries.map((entry) => {
        const active = isActive(persona, entry);
        const caption = entry.assisted
          ? adminAppLabels.assistanceBannerReadOnly
          : active
            ? entry.kind === "visitor"
              ? "Actif en ce moment"
              : "Active en ce moment"
            : entry.kind === "organizer" && entry.badge > 0
              ? "Candidatures à trier"
              : personaKindLabels[entry.kind];
        const icon = kindIcon[entry.kind];
        return (
          <View key={`${entry.kind}:${entry.id}`} style={styles.caps}>
            <HubRow
              lead={icon ? <RowIcon name={icon} /> : <EntryLogo entry={entry} />}
              title={titleOf(entry)}
              caption={caption}
              selected={active}
              trailing={
                active ? (
                  <Icon name="check" size={20} color={t.color.accentText} />
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
              accessibilityLabel={`${titleOf(entry)}, ${active ? "casquette active" : personaKindLabels[entry.kind]}`}
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
      <HubRow
        lead={<RowIcon name="qr" />}
        title="Où je suis staff"
        caption={
          staffEvents.length > 0
            ? staffEvents
                .slice(0, 2)
                .map((s) => `${s.event.title} · ${s.structure.name}`)
                .join(" · ")
            : "Aucun événement pour l'instant · demander à rejoindre une équipe"
        }
        onPress={() => {
          const first = staffEvents[0];
          if (staffEvents.length === 0) onStaffRequest();
          else if (staffEvents.length === 1 && first) router.push(`/staff/${first.event.id}`);
          else choose(base, `${tabHref(base.kind, "sorties") ?? "/"}`);
        }}
        testID="casquette-staff"
      />
    </View>
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
 * Carte de saison `.grade` : « Saison 2026 » et le prochain grade, les points en chiffres étroits 34 px, la jauge rouge
 * de 10 px. Toucher la carte ouvre l'historique des points (audit § 5.1 : plus de ligne « Historique » à part).
 */
export function SeasonCard({
  points,
  grade,
  data,
  onPress,
}: {
  points: number;
  grade: string;
  data: MyPoints | null;
  onPress: () => void;
}) {
  const { t } = useTheme();
  const next = data?.next;
  const ratio = next && next.threshold > 0 ? Math.min(1, points / next.threshold) : 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${data ? data.season.name : "Saison"}, ${points} points, ${grade}. Historique des points`}
      onPress={onPress}
      style={[styles.season, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
      testID="profil-season"
    >
      <View style={styles.between}>
        <Text variant="label" color={t.color.inkMuted}>
          {data ? data.season.name : "Saison"}
        </Text>
        <Text variant="caption" color={t.color.inkMuted}>
          {next ? `${gradeLabels[next.grade]} à ${next.threshold.toLocaleString("fr-FR")} pts` : "Grade maximal"}
        </Text>
      </View>
      <View style={styles.between}>
        <View style={styles.points}>
          <Num size={34}>{points.toLocaleString("fr-FR")}</Num>
          <Num size={16}>pts</Num>
        </View>
        <Text variant="caption" color={t.color.inkMuted}>
          {`Grade ${grade}`}
        </Text>
      </View>
      <View
        style={[styles.track, { backgroundColor: t.color.line }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      >
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: t.color.win }]} />
      </View>
    </Pressable>
  );
}

/** Une tuile de réglage `.mtile` : pictogramme, titre 800, ce qu'elle règle en casse normale. */
export function SettingTile({
  icon,
  title,
  caption,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  caption: string;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${caption}`}
      onPress={onPress}
      style={[styles.tile, { backgroundColor: t.color.surface, borderColor: t.color.cardLine }]}
      testID={testID}
    >
      <Icon name={icon} size={24} color={t.color.ink} />
      <Text variant="bodyStrong" color={t.color.ink} style={styles.tileTitle}>
        {title}
      </Text>
      <Text variant="caption" color={t.color.inkMuted} style={styles.tileCaption}>
        {caption}
      </Text>
    </Pressable>
  );
}

/**
 * Avatar de l'en-tête `.me-av` : carré de 84 px, rayon 22, incliné de −6°, fond rouge (photo du compte si elle existe),
 * initiale en Archivo large italique 34 px.
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
  season: { gap: space1 + 2, padding: space3 + 2, borderRadius: radiusLg },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  points: { flexDirection: "row", alignItems: "baseline", gap: space1 },
  track: { height: 10, borderRadius: 5, overflow: "hidden", flexDirection: "row" },
  fill: { height: 10, borderRadius: 5 },
  tile: {
    width: "48%",
    flexGrow: 1,
    gap: space2,
    padding: space3 + 2,
    minHeight: 104,
    borderRadius: radiusLg,
    borderWidth: 1,
  },
  tileTitle: { fontFamily: "Archivo-ExtraBold", fontSize: 14.5 },
  tileCaption: { fontSize: 12, lineHeight: 15.6 },
  meAv: {
    width: 84,
    height: 84,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ skewX: "-6deg" }],
  },
  meAvImg: { width: 84, height: 84 },
  meAvText: { fontSize: 34, lineHeight: 36, transform: [{ skewX: "6deg" }] },
});
