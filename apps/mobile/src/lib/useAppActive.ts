// L'appli est-elle au premier plan ? (`AppState`, qui sur le navigateur suit `visibilitychange`.) La visionneuse de stories
// s'y appuie : en arrière-plan, la lecture se met en pause (le temps restant est gardé) et rien n'est compté comme vu.
import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    setActive(AppState.currentState === "active");
    return () => sub.remove();
  }, []);
  return active;
}
