// La Boîte a disparu (lot R7c2, D38) : la cloche ouvre l'Activité, la bulle les Messages. Les anciens liens (une
// notification, un lien du site, un favori) arrivent ici et sont renvoyés : `/boite` → `/activite`, `/boite?onglet=messages`
// → `/messages`, `/boite?segment=demandes` → les Demandes de l'Activité.
import { Redirect, useLocalSearchParams } from "expo-router";

export default function BoiteRedirect() {
  const params = useLocalSearchParams<{ segment?: string; onglet?: string }>();
  const wanted = params.onglet ?? params.segment;
  if (wanted === "messages") return <Redirect href="/messages" />;
  if (wanted === "demandes") return <Redirect href="/activite/demandes" />;
  return <Redirect href="/activite" />;
}
