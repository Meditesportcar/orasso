// Le retour système (Android) d'un écran de réglage ouvert depuis les chips de la Page (« Réglages de la structure », « Modifier ma
// fiche », « Modifier ma vitrine », lot R9b) ramène à la **Page**, pas au premier onglet de la barre. Seul l'écran qui l'appelle est
// concerné : le retour des autres onglets ne change pas.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { BackHandler } from "react-native";

export function useBackToPage(pagePath: string) {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        router.navigate(pagePath as never);
        return true;
      });
      return () => sub.remove();
    }, [router, pagePath]),
  );
}
