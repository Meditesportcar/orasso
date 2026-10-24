// « Ton coin » (lot C3, artefact `s-dept` ; lot M6, maquettes 8.1 et 8.2, retours 02 et 03) : la carte des départements
// dans une carte au filet clair (`card-line`), la France remplie d'une teinte « terre » un cran au-dessus de la carte
// (jeton `dept-land`), frontières de la couleur de la carte, départements choisis en moutarde, le favori cerclé. Sous la
// carte : le favori en pastille, puis « +1 », « +2 »… à côté (correction de Damien : rien ne déborde ni ne bouge).
// « Choisir dans une liste » ouvre une feuille à 90 % de la hauteur (recherche, choisis en tête, « Valider (n) ») ; la
// carte est décorative pour le lecteur d'écran, la feuille est son chemin.
import { Button, FranceMap, franceDepartmentByCode, useTheme } from "@orasso/design-system/native";
import {
  arriveeLabels,
  departmentFirstTag,
  departmentHint,
  departmentsMissing,
  departmentWhy,
  overseasDepartmentNames,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ArriveeScreen, ObHead } from "@/features/arrivee/ArriveeScreen";
import { DepartmentSheet } from "@/features/arrivee/DepartmentSheet";
import { MissingLine } from "@/features/arrivee/MissingLine";
import { arriveeStore, departmentLimitReached, toggleDepartment, useArrivee } from "@/features/arrivee/model";
import { T, useArt } from "@/features/tuto/art";

/** Le nom d'un département (outre-mer compris). */
function nameOf(code: string): string {
  return franceDepartmentByCode[code]?.name ?? overseasDepartmentNames[code] ?? code;
}

export default function ArriveeDepartement() {
  const a = useArt();
  const { t } = useTheme();
  const router = useRouter();
  const { profile: chosen, departments } = useArrivee();
  const profile = chosen ?? "exhibitor";
  const [listOpen, setListOpen] = useState(false);
  const [limit, setLimit] = useState(false);
  const [first, ...others] = departments;
  // Lot R3d : l'étape affichée est gardée avec le brouillon (reprise après une fermeture de l'appli).
  useFocusEffect(useCallback(() => arriveeStore.set({ step: "departement" }), []));

  const toggle = (code: string) => {
    if (departmentLimitReached(departments, code)) {
      setLimit(true);
      return;
    }
    setLimit(false);
    arriveeStore.set({ departments: toggleDepartment(arriveeStore.get().departments, code) });
  };

  return (
    <ArriveeScreen
      step={1}
      onClose={() => router.back()}
      footer={
        <>
          <Button
            variant="primary"
            icon="next"
            fullWidth
            disabled={departments.length === 0}
            onPress={() => router.push("/arrivee/identite")}
          >
            {arriveeLabels.next}
          </Button>
          <MissingLine missing={departmentsMissing(departments)} />
        </>
      }
      overlay={
        <DepartmentSheet
          visible={listOpen}
          selected={departments}
          favoriteTag={departmentFirstTag[profile]}
          onCancel={() => setListOpen(false)}
          onValidate={(next) => {
            setLimit(false);
            arriveeStore.set({ departments: next });
            setListOpen(false);
          }}
        />
      }
    >
      <ObHead title={arriveeLabels.department.title} text={departmentWhy[profile]} />
      {/* Décorative pour le lecteur d'écran (le chemin accessible est « Choisir dans une liste ») : rien n'y est annoncé. */}
      <View
        style={[styles.map, { backgroundColor: a.card, boxShadow: `inset 0 0 0 1px ${t.color.cardLine}, ${a.shadow}` }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        testID="department-map"
      >
        <FranceMap
          selected={departments}
          favorite={first ?? null}
          onToggle={toggle}
          land={t.color.deptLand}
          border={a.card}
        />
        <T k="body" size={9.5} lh={12} color={a.muted} style={styles.credit}>
          {arriveeLabels.credit}
        </T>
      </View>
      <View style={styles.dsel} accessibilityLiveRegion="polite" testID="department-summary">
        {first ? (
          <Pressable
            onPress={() => toggle(first)}
            accessibilityRole="button"
            accessibilityLabel={`${arriveeLabels.department.removeAria} ${first}`}
            style={[styles.dchip, styles.fav, { backgroundColor: a.poster, boxShadow: a.shadow }]}
          >
            <View style={[styles.num, { backgroundColor: a.accent }]}>
              <T k="num" size={16} lh={18} color={a.accentInk}>
                {first}
              </T>
            </View>
            <T k="b" size={12.5} lh={16} color={a.posterInk} numberOfLines={1} style={styles.shrink}>
              {`${nameOf(first)} · ${departmentFirstTag[profile]}`}
            </T>
            <T k="body" size={15} lh={16} color={a.posterInk} style={styles.x}>
              ×
            </T>
          </Pressable>
        ) : (
          <T k="cap" color={a.muted}>
            {arriveeLabels.department.empty}
          </T>
        )}
        {others.length > 0 ? (
          <Pressable
            onPress={() => setListOpen(true)}
            accessibilityRole="button"
            style={[styles.dchip, styles.more, { backgroundColor: a.accent, boxShadow: a.shadow }]}
            accessibilityLabel={`${others.length} ${arriveeLabels.department.more}`}
            testID="department-more"
          >
            <T k="num" size={16} lh={18} color={a.accentInk}>
              {`+${others.length}`}
            </T>
          </Pressable>
        ) : null}
      </View>
      {/* Maquette 8.1 : « Choisir dans une liste » en bouton secondaire pleine largeur, la consigne dessous. */}
      <Button
        variant="secondary"
        icon="list"
        fullWidth
        onPress={() => setListOpen(true)}
        accessibilityState={{ expanded: listOpen }}
        testID="department-list-toggle"
      >
        {arriveeLabels.list.open}
      </Button>
      <T k="cap" color={a.muted} style={styles.hint}>
        {`${departmentHint[profile]} ${arriveeLabels.department.hint}`}
      </T>
      {limit ? (
        <T k="cap" color={a.winText} accessibilityRole="alert" testID="department-limit">
          {arriveeLabels.errors.tooMany}
        </T>
      ) : null}
    </ArriveeScreen>
  );
}

const styles = StyleSheet.create({
  map: { borderRadius: 18, padding: 8, minHeight: 200, alignItems: "center", justifyContent: "center" },
  credit: { alignSelf: "flex-end", marginTop: 2 },
  dsel: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, overflow: "hidden" },
  dchip: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, borderRadius: 999 },
  fav: { paddingLeft: 6, paddingRight: 10, flexShrink: 1, minWidth: 0 },
  more: { paddingHorizontal: 12 },
  num: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  shrink: { flexShrink: 1 },
  x: { opacity: 0.6 },
  hint: { marginTop: -4 },
});
