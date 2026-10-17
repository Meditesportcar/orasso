// Export des participants (lot 35a, lot 27 côté API) : `POST /events/:id/participants/export {reason}`. Le motif est
// obligatoire et tracé par l'API (journal d'administration). Le CSV revient dans la réponse : sur téléphone il est écrit
// dans le cache de l'appli puis proposé à la feuille de partage du système (`expo-sharing`) ; dans un navigateur
// (recette), le fichier est téléchargé. Aucune copie n'est gardée par l'appli au-delà du cache.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { ApiRequestError, getSessionToken, NETWORK_MESSAGE } from "./http";
import { exportFileName } from "./teamModel";

export type ExportOutcome = "shared" | "saved" | "unavailable";

export async function exportParticipants(eventId: string, reason: string): Promise<ExportOutcome> {
  const token = getSessionToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/events/${eventId}/participants/export`), {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: reason.trim() }),
    });
  } catch {
    throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiRequestError(
      response.status,
      payload?.error?.code ?? "internal",
      payload?.error?.message ?? "Export impossible.",
    );
  }
  const csv = await response.text();
  const name = exportFileName(response.headers.get("content-disposition"));

  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return "saved";
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: name,
  });
  return "shared";
}
