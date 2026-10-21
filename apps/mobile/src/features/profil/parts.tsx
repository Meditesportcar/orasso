// Morceaux de Mon profil (lot 40, prototype `s-me`) : les casquettes avec leurs accès rapides (ex-feuille « Mes
// casquettes » de la barre du haut, supprimée), la feuille « Créer » (un seul bouton pour structure, fiche pro,
// prestataire, profil média), la carte de saison et les tuiles de réglages.
import { Chip, Icon, type IconName, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { adminAppLabels, gradeLabels, type MyPoints, type MyStaffEvent, mediaAppLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { type AppPersonaEntry, isActive, personaKindLabels, personaOfEntry, tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";

const { space1, space2, space3 } = tokens.spacing;
const { radiusPill } = tokens.radius;

/** Une ligne pressable sur plaque : pictogramme ou avatar, titre, sous-titre, et à droite une pastille ou ›. */
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
    <Plate style={styles.row}>
      {lead}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {title}
        </Text>
        {caption ? (
          <Text variant="meta" color={t.color.plateMuted}>
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="next" size={18} color={t.color.plateMuted} /> : null)}
    </Plate>
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

/** Pictogramme rond d'une ligne. */
export function RowIcon({ name }: { name: IconName }) {
  const { t } = useTheme();
  return (
    <View style={[styles.icon, { backgroundColor: t.color.plateField }]}>
      <Icon name={name} size={20} color={t.color.plateInk} />
    </View>
  );
}

/** Le nom d'une casquette dans la liste (prototype `s-me`). */
function titleOf(entry: AppPersonaEntry): string {
  if (entry.kind === "fan") return "Passionné · exposant";
  if (entry.kind === "visitor") return "Profil visiteur";
  return `${personaKindLabels[entry.kind]} · ${entry.label}`;
}

/**
 * « Mes casquettes » : une ligne par casquette (l'appui change de barre d'onglets, la session reste la même), puis les
 * accès rapides de chaque casquette (candidatures à trier, Où je suis staff, Ma fiche, abonnement, vitrine, contenus).
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
  const { me } = useSession();
  const { persona, entries, choose, base } = usePersona();
  const pseudo = me?.profile.pseudo;
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
    <>
      {entries.map((entry) => {
        const active = isActive(persona, entry);
        const own = entry.kind === "fan" || entry.kind === "visitor";
        const caption = entry.assisted
          ? adminAppLabels.assistanceBannerReadOnly
          : active
            ? entry.kind === "visitor"
              ? "Actif en ce moment"
              : "Active en ce moment"
            : entry.kind === "organizer" && entry.badge > 0
              ? "Candidatures à trier"
              : personaKindLabels[entry.kind];
        return (
          <View key={`${entry.kind}:${entry.id}`} style={styles.group}>
            <HubRow
              lead={
                <Avatar
                  url={own ? me?.profile.avatarUrl : entry.logoUrl}
                  pseudo={own ? pseudo : entry.label}
                  size={44}
                />
              }
              title={titleOf(entry)}
              caption={caption}
              selected={active}
              trailing={
                active ? (
                  <Icon name="check" size={20} color={t.color.plateInk} />
                ) : entry.badge > 0 ? (
                  <Chip surface="plate" variant="accent">{`${entry.badge}`}</Chip>
                ) : undefined
              }
              onPress={() => {
                if (!active) choose(personaOfEntry(entry));
              }}
              accessibilityLabel={`${titleOf(entry)}, ${active ? "casquette active" : personaKindLabels[entry.kind]}`}
              testID={`casquette-${entry.kind}`}
            />
            {entry.kind === "organizer" && entry.badge > 0 && !entry.assisted ? (
              <HubRow
                lead={<RowIcon name="check" />}
                title={`${entry.badge} candidature${entry.badge > 1 ? "s" : ""} à trier`}
                caption={entry.label}
                onPress={() => open(entry, "tri")}
                testID="casquette-quick-sort"
              />
            ) : null}
            {entry.kind === "visitor" ? (
              <HubRow
                lead={<RowIcon name="vehicle" />}
                title="Ajouter un véhicule"
                caption="Pour candidater aux rassemblements"
                onPress={() => router.push("/vehicule/nouveau")}
                testID="casquette-quick-vehicle"
              />
            ) : null}
            {entry.kind === "pro" ? (
              <>
                <HubRow
                  lead={<RowIcon name="plate" />}
                  title="Ma fiche"
                  caption="Activités, remises par grade, réalisations"
                  onPress={() => open(entry, "fiche")}
                  testID="casquette-quick-card"
                />
                {/* Aucun lien de paiement dans l'appli : l'abonnement se gère sur le site. */}
                <HubRow
                  lead={<RowIcon name="grade" />}
                  title="Mon abonnement"
                  caption="Se gère sur le site orasso.fr"
                  testID="casquette-quick-subscription"
                />
              </>
            ) : null}
            {entry.kind === "provider" ? (
              <HubRow
                lead={<RowIcon name="shop" />}
                title="Ma vitrine"
                caption="Métier, photos, prestation, zone d'intervention"
                onPress={() => open(entry, "vitrine")}
                testID="casquette-quick-showcase"
              />
            ) : null}
            {/* lot 55 : profil média (modifier), accréditations, contenus. */}
            {entry.kind === "media" ? (
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
      {/* Le staff n'est pas une casquette (prototype `s-plan`) : ses missions mènent au mode staff de l'événement. */}
      <HubRow
        lead={<RowIcon name="entry" />}
        title="Où je suis staff"
        caption={
          staffEvents.length > 0
            ? staffEvents
                .slice(0, 2)
                .map((s) => `${s.event.title} · ${s.structure.name}`)
                .join(" · ")
            : "Aucun événement pour l'instant"
        }
        onPress={() => {
          const first = staffEvents[0];
          if (staffEvents.length === 1 && first) router.push(`/staff/${first.event.id}`);
          else choose(base, `${tabHref(base.kind, "sorties") ?? "/"}`);
        }}
        testID="casquette-staff"
      />
      <HubRow
        lead={<RowIcon name="staff" />}
        title="Devenir staff d'une structure"
        caption="Demande à rejoindre une équipe"
        onPress={onStaffRequest}
        testID="casquette-staff-request"
      />
    </>
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
  },
  {
    kind: "pro",
    title: "Une fiche pro",
    caption: "Garage, prépa, detailing : être trouvé par les passionnés",
    icon: "briefcase",
    path: "/pro-nouvelle",
  },
  {
    kind: "provider",
    title: "Un profil prestataire",
    caption: "Food truck, photographe, barbier : candidater aux événements",
    icon: "shop",
    path: "/prestataire/nouveau",
  },
  {
    kind: "media",
    title: mediaAppLabels.createTitle,
    caption: mediaAppLabels.createCaption,
    icon: "press",
    path: "/media/nouveau",
  },
] as const;

/** La feuille « Créer » (prototype `sh-create`). */
export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const { entries } = usePersona();
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Créer">
      <Text variant="title" color={t.color.ink}>
        Créer
      </Text>
      {CREATIONS.filter((c) => c.kind === "organizer" || !entries.some((e) => e.kind === c.kind)).map((c) => (
        <HubRow
          key={c.kind}
          lead={<RowIcon name={c.icon} />}
          title={c.title}
          caption={c.caption}
          onPress={() => {
            onClose();
            router.push(c.path);
          }}
          testID={`casquette-create-${c.kind}`}
        />
      ))}
      <Muted variant="caption">
        Chaque création ajoute une casquette dans Mon profil, avec sa propre barre d'onglets.
      </Muted>
    </AppSheet>
  );
}

/** Carte de saison : points, prochain grade et sa jauge (prototype `s-me`, `.grade`). */
export function SeasonCard({ points, grade, data }: { points: number; grade: string; data: MyPoints | null }) {
  const { t } = useTheme();
  const next = data?.next;
  const ratio = next && next.threshold > 0 ? Math.min(1, points / next.threshold) : 1;
  return (
    <Plate style={styles.season} testID="profil-season">
      <View style={styles.between}>
        <Text variant="label" color={t.color.plateMuted}>
          {data ? data.season.name : "Saison"}
        </Text>
        <Text variant="meta" color={t.color.plateMuted}>
          {next ? `${gradeLabels[next.grade]} à ${next.threshold.toLocaleString("fr-FR")} pts` : "Grade maximal"}
        </Text>
      </View>
      <View style={styles.between}>
        <Text variant="posterM" color={t.color.plateInk}>
          {`${points.toLocaleString("fr-FR")} pts`}
        </Text>
        <Text variant="meta" color={t.color.plateMuted}>
          {grade}
        </Text>
      </View>
      <View
        style={[styles.track, { backgroundColor: t.color.plateField }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      >
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: t.color.accent }]} />
      </View>
    </Plate>
  );
}

/** Une tuile de réglage (prototype `.mtile`) : pictogramme, titre, ce qu'elle règle. */
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
      style={styles.tile}
      testID={testID}
    >
      <Plate style={styles.tileBody}>
        <Icon name={icon} size={20} color={t.color.plateInk} />
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {title}
        </Text>
        <Text variant="meta" color={t.color.plateMuted}>
          {caption}
        </Text>
      </Plate>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space2 + 4 },
  text: { flex: 1, gap: space1 },
  group: { gap: space2 },
  icon: { width: 44, height: 44, borderRadius: radiusPill, alignItems: "center", justifyContent: "center" },
  season: { gap: space2, padding: space3 },
  between: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  track: { height: 6, borderRadius: radiusPill, overflow: "hidden" },
  fill: { height: 6, borderRadius: radiusPill },
  tile: { width: "48%", flexGrow: 1 },
  tileBody: { gap: space1, padding: space3, minHeight: 108 },
});
