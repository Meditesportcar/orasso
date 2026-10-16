// Barre du haut commune à toutes les casquettes (docs/02, README AppBar) : monogramme, titre, puis Recherche, Cloche
// et Avatar. L'avatar porte le logo de la casquette active et un point moutarde si une autre casquette a quelque chose à
// traiter. Appui court : feuille « Mes casquettes » (ou « Moi » directement quand on n'a que la casquette de passionné) ;
// appui long : retour au passionné. La recherche renvoie vers Explorer jusqu'au lot 29.
import { AppBar } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CasquettesSheet } from "@/features/casquettes/CasquettesSheet";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { Avatar } from "./Avatar";

export function TopBar({
  title,
  facts,
  home = false,
  onNotifications,
  notificationsOn,
}: {
  title?: string;
  facts?: string;
  /** Accueil du passionné : le logotype à la place du titre. */
  home?: boolean;
  onNotifications: () => void;
  notificationsOn: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me } = useSession();
  const { persona, entries, active, elsewhere, backToFan } = usePersona();
  const [casquettes, setCasquettes] = useState(false);
  const fan = persona.kind === "fan";
  return (
    <>
      <AppBar
        kind={home ? "home" : "page"}
        title={title}
        facts={facts}
        safeTop={insets.top}
        notificationCount={me?.counts.unreadNotifications}
        onSearch={() => router.navigate("/explorer")}
        onNotifications={onNotifications}
        notificationsOn={notificationsOn}
        onAvatar={() => (entries.length > 1 ? setCasquettes(true) : router.push("/moi"))}
        onAvatarLongPress={fan ? undefined : backToFan}
        avatarDot={elsewhere > 0}
        avatar={
          <Avatar url={fan ? me?.profile.avatarUrl : active.logoUrl} pseudo={fan ? me?.profile.pseudo : active.label} />
        }
      />
      <CasquettesSheet visible={casquettes} onClose={() => setCasquettes(false)} />
    </>
  );
}
