// Préparation de la photo d'une story sur le site (lot R7f3) : la photo choisie est ramenée à 2048 px au plus (le serveur la
// recompresse à ce côté de toute façon) et rendue en JPEG ; elle sert d'affichage, de support au cadre de plaque et d'envoi.
// Les cadres de plaque, en fractions de la photo, valent donc sur elle comme sur l'original.

/** Côté le plus long de la photo envoyée (comme l'appli, `STORY_UPLOAD_SIDE`). */
export const STORY_SIDE = 2048;

/** Taille de sortie : la photo garde son format, son plus long côté est ramené à `max` si besoin. */
export function fitSize(width: number, height: number, max: number = STORY_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest <= 0) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export type StoryPhoto = { file: File; url: string; width: number; height: number };

/** Lit, réduit et convertit en JPEG ; `null` si le navigateur ne sait pas lire l'image. */
export async function prepareStoryPhoto(source: File): Promise<StoryPhoto | null> {
  const bitmap = await createImageBitmap(source).catch(() => null);
  if (!bitmap) return null;
  const out = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, out.width, out.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return null;
  const file = new File([blob], "story.jpg", { type: "image/jpeg" });
  return { file, url: URL.createObjectURL(file), width: out.width, height: out.height };
}
