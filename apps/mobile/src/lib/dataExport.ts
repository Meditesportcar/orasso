// Export de mes données (lot 35c) : l'API renvoie un JSON, l'appli l'écrit dans le cache de l'appareil puis ouvre la
// feuille de partage du système (Fichiers, Drive, e-mail…). Sur le web (recette), le navigateur enregistre le fichier.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { exportFileName, exportText } from "./accountTools";

export type ExportOutcome = "shared" | "saved" | "unavailable";

export async function saveExport(data: unknown): Promise<ExportOutcome> {
  const text = exportText(data);
  const name = exportFileName(new Date());
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return "saved";
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Mes données Orasso",
  });
  return "shared";
}
