// La feuille « Mes casquettes » (lot R9n, maquette R9 `mcSheet`) : « Moi · <pseudo> » d'abord (le compte personnel), puis chaque
// casquette de page (logo, nom, type), l'active marquée. Choisir change de casquette et ferme la feuille ; sur le Fil, on reste
// sur le Fil de la nouvelle casquette. Réutilisée par la pastille de la barre du haut, par « Changer » du Fil et par la ligne
// « Mes casquettes » de la Page. Les lignes et leur ordre viennent de `casquetteRows` (`@orasso/shared`, pur et testé).
import { Icon, OrgLogo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { casquetteRows, casquettesLabels as L, type SheetRow } from "@orasso/shared";
import { useSegments } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { RowIcon } from "@/features/profil/parts";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { type Persona, personaKindLabels, personaOfEntry, tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";
import { closeCasquettes, useCasquettesOpen } from "./sheetStore";

const { space2, space3 } = tokens.spacing;
const { radiusLg } = tokens.radius;

export function CasquettesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const { me } = useSession();
  const { persona, base, entries, choose } = usePersona();
  const segments = useSegments() as string[];
  const rows = casquetteRows(entries, {
    base: base.kind,
    pseudo: me?.profile.pseudo ?? "",
    avatarUrl: me?.profile.avatarUrl ?? null,
    activeKind: persona.kind,
    activeId:
      persona.kind === "organizer"
        ? persona.structureId
        : persona.kind === "pro"
          ? persona.proProfileId
          : persona.kind === "media"
            ? persona.mediaProfileId
            : null,
    kindLabel: (kind) => personaKindLabels[kind as keyof typeof personaKindLabels] ?? kind,
  });
  const pick = (row: SheetRow) => {
    onClose();
    if (row.active) return;
    const next: Persona =
      row.id === null
        ? base
        : (() => {
            const entry = entries.find((e) => e.kind === row.kind && e.id === row.id);
            return entry ? personaOfEntry(entry) : base;
          })();
    // Sur le Fil, on reste sur le Fil de la nouvelle casquette (« Changer » puis « Moi » : le Fil du passionné).
    const onFil = segments[1] === "fil";
    choose(next, (onFil ? tabHref(next.kind, "fil") : null) ?? undefined);
  };
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.sheetTitle}>
      <Text variant="title" color={t.color.ink}>
        {L.sheetTitle}
      </Text>
      <View style={styles.note}>
        <Icon name="info" size={20} color={t.color.inkMuted} />
        <Text variant="caption" color={t.color.inkMuted} style={styles.noteText} testID="casquettes-intro">
          {L.sheetIntro}
        </Text>
      </View>
      <View style={styles.list}>
        {rows.map((row) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityState={{ selected: row.active }}
            accessibilityLabel={`${row.title}, ${row.subtitle}${row.active ? `, ${L.active.toLowerCase()}` : ""}`}
            onPress={() => pick(row)}
            style={[
              styles.row,
              { backgroundColor: t.color.surface, borderColor: row.active ? t.color.accent : t.color.line },
            ]}
            testID={row.id === null ? "casquettes-me" : `casquettes-${row.kind}`}
          >
            {row.id === null ? (
              <RowIcon name="profile" />
            ) : (
              <OrgLogo name={row.title} logoUrl={mediaSource(row.logoUrl)?.uri ?? null} size={44} />
            )}
            <View style={styles.text}>
              <Text variant="bodyStrong" color={t.color.ink}>
                {row.title}
              </Text>
              <Text variant="caption" color={t.color.inkMuted}>
                {row.subtitle}
              </Text>
            </View>
            {row.active ? <Icon name="check" size={20} color={t.color.accentText} /> : null}
          </Pressable>
        ))}
      </View>
    </AppSheet>
  );
}

/** La feuille du groupe d'onglets : montée une fois par `PersonaTabs`, ouverte par `openCasquettes()`. */
export function CasquettesSheetHost() {
  const visible = useCasquettesOpen();
  return <CasquettesSheet visible={visible} onClose={closeCasquettes} />;
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
  noteText: { flex: 1 },
  list: { gap: space2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderWidth: 2,
    borderRadius: radiusLg,
  },
  text: { flex: 1, gap: 2 },
});
