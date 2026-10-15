import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { apiUrl } from "@/api";

type Health = "loading" | "ok" | "error";

// Écran provisoire du socle : vérifie que l'appli joint l'API. Les vrais écrans arrivent avec le lot 09.
export default function Home() {
  const [health, setHealth] = useState<Health>("loading");

  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then((res) => setHealth(res.ok ? "ok" : "error"))
      .catch(() => setHealth("error"));
  }, []);

  const message = {
    loading: "Connexion à l'API…",
    ok: "API joignable",
    error: "API injoignable",
  }[health];

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Text accessibilityRole="header">Orasso</Text>
      <Text>{message}</Text>
    </View>
  );
}
