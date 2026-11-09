import { redirect } from "react-router";

// « Mes crews » (lot 19) est devenu l'onglet Crew (lot R7b2, D38) : `/app/crews` y renvoie, définitivement. La création d'un
// crew a sa page (`/app/crews/nouveau`).
export function loader() {
  throw redirect("/app/crew", 301);
}
