// « Mes publications » (lot R7e2) devient, au lot R8b2 (D40), l'onglet « Publications » de mon profil : l'écran n'est plus qu'une
// redirection, pour que les anciens liens tiennent (Réglages, l'écran « Publier », une notification déjà reçue). Supprimer une de
// mes publications se fait désormais par le menu « ⋯ » de la publication (`features/publications/PostMenu`).
import { Redirect } from "expo-router";

export function MyPostsScreen() {
  return <Redirect href="/profil?onglet=publications" />;
}
