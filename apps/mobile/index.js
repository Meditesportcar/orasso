// Point d'entrée de l'appli. Dans un build de recette (EXPO_PUBLIC_SHOW_FATAL=1, profil EAS « preview »), une erreur
// JavaScript fatale au démarrage est affichée à l'écran au lieu de fermer l'appli sans explication : c'est le seul
// moyen de la lire sur un téléphone sans câble ni outil de débogage. Sinon, comportement normal de React Native.
import { Alert } from "react-native";

const showFatal = process.env.EXPO_PUBLIC_SHOW_FATAL === "1";

function show(error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const stack = error instanceof Error && error.stack ? `\n\n${error.stack.slice(0, 1200)}` : "";
  Alert.alert("Orasso — erreur au démarrage", `${message}${stack}`);
}

if (showFatal && global.ErrorUtils) {
  const previous = global.ErrorUtils.getGlobalHandler();
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      show(error);
      return;
    }
    previous(error, isFatal);
  });
}

try {
  require("expo-router/entry");
} catch (error) {
  if (!showFatal) throw error;
  show(error);
}
