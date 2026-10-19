// « Ton coin » (prototype `s-dept`) : carte de France des départements, sélection multiple, le premier choisi est le favori
// (ou le département principal). Sert à Explorer quand la position est refusée. Crédit CC BY 4.0 sous la carte (H7) ;
// « Choisir dans une liste » ouvre les 101 départements en cases à cocher (chemin accessible, outre-mer compris).
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { arriveeLabels, departmentHint, departmentWhy } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { ArriveeScreen } from "@/features/arrivee/ArriveeScreen";
import { DepartmentPicker } from "@/features/arrivee/DepartmentPicker";
import { DepartmentSummary } from "@/features/arrivee/DepartmentSummary";
import { arriveeStore, toggleDepartment, useArrivee } from "@/features/arrivee/model";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

export default function ArriveeDepartement() {
  const { t } = useTheme();
  const router = useRouter();
  const { profile: chosen, departments } = useArrivee();
  const profile = chosen ?? "exhibitor";

  return (
    <ArriveeScreen
      step={1}
      onBack={() => router.back()}
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
      <View style={styles.head}>
        <Text variant="posterL" color={t.color.ink} accessibilityRole="header">
          {arriveeLabels.department.title}
        </Text>
        <Muted variant="body">{departmentWhy[profile]}</Muted>
      </View>
      <DepartmentPicker
        selected={departments}
        onToggle={(code) => arriveeStore.set({ departments: toggleDepartment(arriveeStore.get().departments, code) })}
        summary={<DepartmentSummary selected={departments} profile={profile} />}
      />
      <Muted variant="caption">{`${departmentHint[profile]} ${arriveeLabels.department.hint}`}</Muted>
    </ArriveeScreen>
  );
}

const styles = StyleSheet.create({ head: { gap: space2, marginBottom: space3 } });
