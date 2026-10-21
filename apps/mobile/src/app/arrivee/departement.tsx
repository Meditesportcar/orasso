// « Ton coin » (lot C3, artefact `s-dept`) : la carte des départements dans une carte (`.dept-map`, crédit en bas à
// droite), la puce du favori (`.dchip.fav` : numéro moutarde, nom, « favori », ×) et « +N », la consigne, puis
// « Continuer ». Le premier choisi est le favori (ou le département principal). La carte est décorative pour le
// lecteur d'écran : « Choisir dans une liste » (lien discret) ouvre les 101 départements en cases à cocher.
import { Button, DepartmentChecklist, FranceMap, franceDepartmentByCode } from "@orasso/design-system/native";
import {
  arriveeLabels,
  departmentFirstTag,
  departmentHint,
  departmentWhy,
  overseasDepartmentNames,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ArriveeScreen, ObHead } from "@/features/arrivee/ArriveeScreen";
import { arriveeStore, departmentLimitReached, toggleDepartment, useArrivee } from "@/features/arrivee/model";
import { T, useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";

/** Le nom d'un département (outre-mer compris). */
function nameOf(code: string): string {
  return franceDepartmentByCode[code]?.name ?? overseasDepartmentNames[code] ?? code;
}

export default function ArriveeDepartement() {
  const a = useArt();
  const router = useRouter();
  const { profile: chosen, departments } = useArrivee();
  const profile = chosen ?? "exhibitor";
  const [listOpen, setListOpen] = useState(false);
  const [limit, setLimit] = useState(false);
  const [first, ...others] = departments;

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
        <Button
          variant="primary"
          icon="next"
          fullWidth
          disabled={departments.length === 0}
          onPress={() => router.push("/arrivee/identite")}
        >
          {arriveeLabels.next}
        </Button>
      }
    >
      <ObHead title={arriveeLabels.department.title} text={departmentWhy[profile]} />
      <View
        style={[styles.map, { backgroundColor: a.card, boxShadow: a.shadow }]}
        accessibilityLabel={arriveeLabels.department.mapLabel}
      >
        <FranceMap selected={departments} favorite={first ?? null} onToggle={toggle} />
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
          <View
            style={[styles.dchip, styles.more, { backgroundColor: a.accent, boxShadow: a.shadow }]}
            accessibilityLabel={`${others.length} ${arriveeLabels.department.more}`}
          >
            <T k="num" size={16} lh={18} color={a.accentInk}>
              {`+${others.length}`}
            </T>
          </View>
        ) : null}
      </View>
      <T k="cap" color={a.muted} style={styles.hint}>
        {`${departmentHint[profile]} ${arriveeLabels.department.hint}`}
      </T>
      {limit ? (
        <T k="cap" color={a.win} accessibilityRole="alert" testID="department-limit">
          {arriveeLabels.errors.tooMany}
        </T>
      ) : null}
      {/* Chemin accessible (la carte ne se lit pas au lecteur d'écran) : lien discret, `.btn-g.sm`. */}
      <Pressable
        onPress={() => setListOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: listOpen }}
        testID="department-list-toggle"
        style={styles.listLink}
      >
        <ArtIcon name={listOpen ? "x" : "chr"} size={16} color={a.ink} />
        <T k="btn" size={12} lh={14} color={a.ink}>
          {listOpen ? arriveeLabels.list.close : arriveeLabels.list.open}
        </T>
      </Pressable>
      {listOpen ? <DepartmentChecklist selected={departments} onToggle={toggle} surface="surface" /> : null}
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
  listLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 6,
    alignSelf: "flex-start",
  },
});
