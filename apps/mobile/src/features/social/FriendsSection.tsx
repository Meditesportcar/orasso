// Moi > Mes amis (lot 17) : entrée vers la liste des amis, des demandes et du scanner de QR ami.
import { Button } from "@orasso/design-system/native";
import { socialLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { SectionTitle } from "@/ui/Screens";

export function FriendsSection() {
  const router = useRouter();
  return (
    <>
      <SectionTitle>{socialLabels.myFriends}</SectionTitle>
      <Button variant="plate" icon="crew" onPress={() => router.push("/amis")} fullWidth testID="moi-amis">
        {socialLabels.myFriends}
      </Button>
    </>
  );
}
