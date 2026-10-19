// « Ton coin » (prototype `s-dept`) : carte de France des départements, sélection multiple, le premier choisi est le favori
// (ou le département principal). Sert à Explorer quand la position est refusée. Crédit CC BY 4.0 sous la carte (H7).
// Connexion Google / Apple : le profil et les départements s'enregistrent ici (`PATCH /me/profile`), sans l'écran suivant.
import { Button, FranceMap, FranceMapCredit, Text, tokens, useTheme } from "@orasso/design-system/native";
import { arriveeLabels, departmentHint, departmentWhy } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { DepartmentSummary } from "@/features/arrivee/DepartmentSummary";
import { FlowScreen } from "@/features/arrivee/FlowScreen";
import { arriveeStore, favoriteOf, SOCIAL_PENDING_KEY, toggleDepartment, useArrivee } from "@/features/arrivee/model";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/http";
import { kvDel } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

export default function ArriveeDepartement() {
  const { t } = useTheme();
  const router = useRouter();
  const { refreshMe } = useSession();
  const { profile: chosen, departments, social, next } = useArrivee();
  const profile = chosen ?? "exhibitor";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function proceed() {
    if (!social) {
      router.push("/arrivee/identite");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ mainProfile: profile, departments });
      await kvDel(SOCIAL_PENDING_KEY);
      await refreshMe();
      arriveeStore.reset();
      router.replace((next ?? "/") as never);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      step={1}
      onBack={() => router.back()}
      footer={
        <Button
          variant="primary"
          icon="next"
          fullWidth
          loading={busy}
          disabled={departments.length === 0}
          onPress={() => void proceed()}
        >
          {arriveeLabels.next}
        </Button>
      }
    >
      <View style={styles.head}>
        <Text variant="posterL" color={t.color.ink}>
          {arriveeLabels.department.title}
        </Text>
        <Muted variant="body">{departmentWhy[profile]}</Muted>
      </View>
      <FranceMap
        selected={departments}
        favorite={favoriteOf(departments)}
        onToggle={(code) => arriveeStore.set({ departments: toggleDepartment(arriveeStore.get().departments, code) })}
        accessibilityLabel={arriveeLabels.department.mapLabel}
      />
      <FranceMapCredit />
      <DepartmentSummary selected={departments} profile={profile} />
      <Muted variant="caption">{`${departmentHint[profile]} ${arriveeLabels.department.hint}`}</Muted>
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({ head: { gap: space2, marginBottom: space3 } });
