// Moi, mes casquettes : la liste (passionné, structures, fiche pro, profil prestataire) avec un appui pour changer de
// casquette, créer une structure / une fiche pro / un profil prestataire, et « Devenir staff » d'une structure.
import { Button } from "@orasso/design-system/native";

import { CreateCasquettes, PersonaRows } from "@/features/casquettes/parts";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";

export function CasquettesSection({ onStaff }: { onStaff: () => void }) {
  return (
    <>
      <SectionTitle>Mes casquettes</SectionTitle>
      <PersonaRows />
      <Muted variant="caption">
        Un appui sur une casquette change la barre d'onglets : tu gardes la même session. Appui long sur ton avatar =
        retour au passionné.
      </Muted>
      <CreateCasquettes />
      <Muted variant="label">Rejoindre une équipe</Muted>
      <Button variant="plate" icon="staff" onPress={onStaff} fullWidth>
        Devenir staff d'une structure
      </Button>
    </>
  );
}
