// Mode staff (docs/02 « Mode staff (détail) ») : plein écran, pour un événement ; quittable d'un geste ; fermé à J+1.
// Lot 48 (D25b, décision de Damien du 19/10/2026) : le thème suit le choix de l'utilisateur (Béton par défaut, Sable
// ou Automatique selon le soleil) ; plus de Sable imposé. La barre d'état est celle de la racine (même thème).
import { Stack } from "expo-router";

export default function StaffLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
}
