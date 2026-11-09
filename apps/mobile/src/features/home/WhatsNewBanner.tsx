// Bandeau « où sont passées les choses » (lot R7a1, décision D38) : une seule fois après la mise à jour (Sorties dans
// l'Accueil, Garage dans le Profil, un onglet Crew). Posé en haut de l'Accueil de l'exposant et du visiteur ; « Compris »
// le range pour de bon. Clé `whatsnew:r7` **par compte** (`cacheScope`) : un autre compte sur le même téléphone le voit
// à son tour ; rien n'est lu ni écrit sans compte lié. Tant que la clé n'est pas lue, rien ne s'affiche (pas de saut).
import { Plate, Text, useTheme } from "@orasso/design-system/native";
import { navLabels } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { cacheScope, kvGet, kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { SmButton } from "@/ui/Kit";

const KEY = "whatsnew:r7";
const keyOf = (account: string) => `${KEY}.${account}`;

export function WhatsNewBanner() {
  const { t } = useTheme();
  const { me } = useSession();
  const accountId = me?.user.id ?? null;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
    const account = cacheScope();
    if (!accountId || !account) return undefined;
    let cancelled = false;
    void kvGet(keyOf(account)).then((seen) => {
      // Le compte a changé pendant la lecture : la valeur n'est plus la sienne.
      if (!cancelled && !seen && cacheScope() === account) setShown(true);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!shown) return null;
  const dismiss = () => {
    const account = cacheScope();
    setShown(false);
    if (account) void kvSet(keyOf(account), "1");
  };
  return (
    <Plate kind="note" style={styles.box} testID="whatsnew-banner">
      <Text variant="body" color={t.color.plateInk}>
        {navLabels.whatsNew.text}
      </Text>
      <View style={styles.row}>
        <SmButton kind="s" icon="check" onPress={dismiss} testID="whatsnew-dismiss">
          {navLabels.whatsNew.dismiss}
        </SmButton>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  row: { flexDirection: "row" },
});
