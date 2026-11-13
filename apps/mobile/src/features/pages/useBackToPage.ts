// Le retour système (Android) d'un écran de réglage ouvert depuis les chips de la Page (« Réglages de la structure », « Modifier ma
// fiche », « Modifier ma vitrine », lot R9b) ramène à la **Page**, pas au premier onglet de la barre. Seul l'écran qui l'appelle est
// concerné : le retour des autres onglets ne change pas.
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";

import { appReturn } from "@/lib/closeTo";

export function useBackToPage(pagePath: string) {
  const router = useRouter();
  // `?retour=` (comme le ✕ de `useCloseTo`) : l'assistant ou la fiche d'événement qui a ouvert l'écran.
  const { retour } = useLocalSearchParams<{ retour?: string }>();
  const back = appReturn(retour);
  useFocusEffect(
    useCallback(() => {
      // Le retour système n'existe que sur Android (sur le web `BackHandler` écrit une erreur dans la console).
      if (Platform.OS !== "android") return undefined;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (back) router.dismissTo(back as never);
        else router.navigate(pagePath as never);
        return true;
      });
      return () => sub.remove();
    }, [router, pagePath, back]),
  );
}
