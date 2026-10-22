// Mode staff (docs/02 « Mode staff (détail) ») : plein écran, pour un événement ; quittable d'un geste ; fermé à J+1.
// Lot 48 (D25b, décision de Damien du 19/10/2026) : le thème suit le choix de l'utilisateur (Béton par défaut, Sable
// ou Automatique selon le soleil) ; plus de Sable imposé. La barre d'état est celle de la racine (même thème).
// Lot C4a (artefact `sh-slist`, `sh-splace`, `sh-sbill`) : Liste, Placement et Contrôle des billets s'ouvrent comme des
// feuilles qui montent du bas, par-dessus l'entrée du mode staff (feuille de page en iOS, glissement du bas en Android).
// Ce sont toujours des écrans de la pile : clavier, caméra des billets et liste hors réseau ne changent pas (journal).
import { Stack } from "expo-router";

const sheet = { presentation: "modal", animation: "slide_from_bottom", gestureEnabled: true } as const;

export default function StaffLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="liste" options={sheet} />
      <Stack.Screen name="placement" options={sheet} />
      <Stack.Screen name="boutique" options={sheet} />
    </Stack>
  );
}
