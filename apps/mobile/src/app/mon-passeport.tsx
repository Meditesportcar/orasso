// Passeport pour les autres profils (lot 50) : ouvert par la tuile « Mon passeport » de Mon profil. Le visiteur a son
// onglet (`(visitor)/passeport.tsx`) ; ce chemin porte un autre nom parce qu'un groupe de routes ne change pas l'adresse
// (`/passeport` serait en double).
import { PassportScreen } from "@/features/passport/PassportScreen";

export default function MonPasseport() {
  return <PassportScreen tab={false} />;
}
