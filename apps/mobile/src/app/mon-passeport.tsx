// Passeport (lot 50) : ouvert par la tuile « Mon passeport » de Mon profil. Lot R7a1 : le visiteur n'a plus son
// onglet, et `/passeport` redirige ici.
import { PassportScreen } from "@/features/passport/PassportScreen";

export default function MonPasseport() {
  return <PassportScreen tab={false} />;
}
