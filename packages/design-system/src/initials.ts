// Initiales d'une structure (lot C1, repli `.orglogo` de l'artefact DA v2 : trois lettres moutarde sur encre).
// Pur : sert à l'appli et au site.

/** Trois lettres au plus : « MéditeSportCar » → « MSC », « Club Auto 66 » → « CA6 », « Turbo » → « TU ». */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1)
    return words
      .map((w) => w.charAt(0))
      .join("")
      .slice(0, 3)
      .toUpperCase();
  // Un seul mot : ses capitales (MéditeSportCar → MSC), sinon ses deux premières lettres.
  const caps = (words[0] ?? "").match(/\p{Lu}/gu) ?? [];
  if (caps.length > 1) return caps.join("").slice(0, 3);
  return (words[0] ?? "").slice(0, 2).toUpperCase();
}
