// Ancien flux « Candidater » en trois écrans (remplacé au lot C2b par la feuille unique de la fiche, prototype
// `sh-cand`). Le chemin reste pour les liens du site (`/e/<slug>/candidater`, `+native-intent.ts`) et les retours de
// connexion : il ouvre la fiche avec la feuille de candidature, en gardant le jour choisi (`?jour=`).
import { Redirect, useLocalSearchParams } from "expo-router";

export default function Candidater() {
  const { slug, jour } = useLocalSearchParams<{ slug: string; jour?: string }>();
  return <Redirect href={{ pathname: "/e/[slug]", params: { slug, candidater: "1", ...(jour ? { jour } : {}) } }} />;
}
