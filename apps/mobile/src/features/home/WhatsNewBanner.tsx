// Bandeau « où sont passées les choses » (lot R7a1, décision D38 ; tour 2 : texte et place de la maquette R7.1) : une
// seule fois après la mise à jour. Posé sous le bonjour de l'Accueil de l'exposant et du visiteur (le visiteur n'a pas de
// garage : sa variante n'en parle pas) ; le ✕ le range pour de bon. Clé `whatsnew:r7` **par compte** (`cacheScope`) : un
// autre compte sur le même téléphone le voit à son tour ; rien n'est lu ni écrit sans compte lié. Tant que la clé n'est
// pas lue, rien ne s'affiche (pas de saut).
import { Icon, Plate, Text, useTheme } from "@orasso/design-system/native";
import { navLabels } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { cacheScope, kvGet, kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";

const KEY = "whatsnew:r7";
const keyOf = (account: string) => `${KEY}.${account}`;

export function WhatsNewBanner({ variant }: { variant: "exhibitor" | "visitor" }) {
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
      <View style={styles.text}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {navLabels.whatsNew.title}
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          {navLabels.whatsNew[variant]}
        </Text>
      </View>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={navLabels.whatsNew.dismiss}
        hitSlop={4}
        style={styles.close}
        testID="whatsnew-dismiss"
      >
        <Icon name="close" size={20} color={t.color.plateInk} />
      </Pressable>
    </Plate>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  text: { flex: 1, gap: 4 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginTop: -8, marginRight: -8 },
});
