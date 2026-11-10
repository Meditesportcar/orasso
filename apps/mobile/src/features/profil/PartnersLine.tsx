// Les partenaires du Profil (maquette R7.12 et R7.20 `pq_pro`, lot R7m1) : les pros partenaires d'un passionné. Lot R8b1 (maquette
// R8.1) : la ligne de logos disparaît de l'en-tête, les partenaires sont le 4e compteur de la bande (« partenaire » /
// « partenaires », seulement quand il y en a). Ce composant garde la lecture et les feuilles : il donne au compteur sa
// valeur et son toucher (`PartnersCell`), et pose la liste dans la zone des feuilles de l'écran. Sur le profil d'un autre,
// un partenaire ouvre sa fiche, plusieurs ouvrent la liste. Sur mon profil : la liste, avec « Mettre fin » (feuille de
// confirmation : le pro est prévenu, les contenus déjà publiés gardent leur mention). Les partenaires d'un autre viennent
// de `GET /users/:pseudo` (vide pour un compte privé que je ne suis pas) ; les miens de `GET /me/partnerships`. Tour 2 de
// R7m1 : une panne de cette lecture ne ressemble jamais à « aucun partenaire » (le compteur affiche « – », le toucher
// ouvre le message et « Réessayer ») ; un partenaire dont la fiche n'est plus visible reste dans la liste (« Pro
// indisponible ») et on peut y mettre fin ; tirer pour actualiser relance cette lecture (`reloadKey`).
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { partnershipLabels as L, type PartnerLogo, profileTabsLabels as PT } from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { EndSheet } from "@/features/partnerships/EndSheet";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Overlay } from "@/ui/Overlay";

const { space1, space2, space3 } = tokens.spacing;

/**
 * Ce que le compteur « partenaires » de la bande sait : `count` (`null` = la lecture a échoué, le compteur affiche « – »),
 * les noms pour la lecture d'écran, et son toucher. Pas de cellule du tout (`null`) tant qu'il n'y a aucun partenaire.
 */
export type PartnersCell = { count: number | null; names: string; onPress: () => void };

type Row = {
  key: string;
  id: string | null;
  name: string;
  logoUrl: string | null;
  slug: string;
  detail: string | null;
  /** Faux : la fiche du pro n'est plus visible (dépubliée, non vérifiée, titulaire suspendu). */
  available: boolean;
};

export function PartnersHost({
  partners,
  mine,
  reloadKey = 0,
  children,
}: {
  partners?: PartnerLogo[] | null;
  mine: boolean;
  /** Change à chaque « tirer pour actualiser » de l'écran : la lecture de mes partenaires repart. */
  reloadKey?: number;
  /** Le compteur de la bande reçoit sa cellule (`null` : rien à montrer). */
  children: (cell: PartnersCell | null) => ReactNode;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const my = useApi(() => api.myPartnerships(), [reloadKey], { cacheKey: "my-partnerships", enabled: mine });
  const [open, setOpen] = useState(false);
  const [ending, setEnding] = useState<Row | null>(null);
  // Dernière lecture réussie vue par cet écran (l'API ne dit pas l'âge d'une copie locale) : sert à « Données d'il y a N min ».
  const freshAt = useRef<Date | null>(null);
  useEffect(() => {
    if (my.data && !my.error && !my.offline) freshAt.current = new Date();
  }, [my.data, my.error, my.offline]);

  const rows: Row[] = mine
    ? (my.data?.items ?? []).map((i) => ({
        key: i.id,
        id: i.id,
        name: i.pro.name,
        logoUrl: i.pro.logoUrl,
        slug: i.pro.slug,
        detail: i.available
          ? [`depuis le ${formatDay(i.since)}`, i.vehicle?.label].filter(Boolean).join(" · ")
          : [L.unavailablePro, `depuis le ${formatDay(i.since)}`].join(" · "),
        available: i.available,
      }))
    : (partners ?? []).map((p) => ({
        key: p.proId,
        id: null,
        name: p.name,
        logoUrl: p.logoUrl,
        slug: p.slug,
        detail: null,
        available: true,
      }));
  // Panne : jamais confondue avec « aucun partenaire », avec ou sans copie locale. Avec une copie non vide, les lignes
  // restent sous l'erreur, datées.
  const failure =
    mine && my.error ? (
      <View testID="partners-error" style={styles.failure}>
        <LoadError message={L.partnersLoadError} onRetry={() => void my.reload()} />
        {rows.length ? (
          <Text variant="caption" color={c.inkMuted} testID="partners-stale">
            {freshAt.current
              ? L.partnersStale(Math.floor((Date.now() - freshAt.current.getTime()) / 60_000))
              : L.partnersStaleUnknown}
          </Text>
        ) : null}
      </View>
    ) : null;
  const first = rows[0];
  const title = rows.length ? L.partnersLine(rows.length) : PT.partnersTitle;
  const failed = mine && Boolean(my.error);
  // Rien à montrer : ni partenaire ni panne (la lecture en cours ne fait pas apparaître de compteur).
  if (!rows.length && !failed) return <>{children(null)}</>;
  const cell: PartnersCell = {
    count: failed ? null : rows.length,
    names: rows.map((r) => r.name).join(", "),
    onPress: () => {
      if (!mine && rows.length === 1 && first) router.push(`/p/${first.slug}`);
      else setOpen(true);
    },
  };

  return (
    <>
      {children(cell)}
      <Overlay>
        <AppSheet visible={open && !ending} onClose={() => setOpen(false)} accessibilityLabel={title}>
          <View style={styles.head}>
            <Text variant="posterM" color={c.ink} accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Button variant="close" label="Fermer" onPress={() => setOpen(false)} testID="partners-sheet-close" />
          </View>
          {failure}
          {rows.map((r) => (
            <View
              key={r.key}
              style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
              testID="partner-row"
            >
              <Pressable
                accessibilityRole={r.available ? "link" : "text"}
                accessibilityLabel={r.name}
                disabled={!r.available}
                onPress={() => {
                  setOpen(false);
                  router.push(`/p/${r.slug}`);
                }}
                style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
              >
                <Avatar url={r.logoUrl} pseudo={r.name} size={40} />
                <View style={styles.text}>
                  <Text variant="bodyStrong" color={c.ink}>
                    {r.name}
                  </Text>
                  {r.detail ? (
                    <Text variant="caption" color={c.inkMuted}>
                      {r.detail}
                    </Text>
                  ) : null}
                </View>
                {r.available ? <Icon name="next" size={16} color={c.inkMuted} /> : null}
              </Pressable>
              {mine && r.id ? (
                <Button variant="secondary" icon="close" fullWidth onPress={() => setEnding(r)} testID="partner-end">
                  {L.end}
                </Button>
              ) : null}
            </View>
          ))}
        </AppSheet>
        <EndSheet
          visible={ending !== null}
          name={ending?.name ?? ""}
          onClose={() => setEnding(null)}
          onConfirm={async () => {
            if (!ending?.id) return;
            try {
              await api.endPartnership(ending.id);
            } catch (e) {
              // Déjà fini ailleurs (409/404) : la liste se relit pour dire la vérité, l'erreur reste dans la feuille.
              void my.reload();
              throw e;
            }
            setEnding(null);
            setOpen(false);
            await my.reload();
          }}
        />
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  failure: { gap: space2 },
  text: { flex: 1, gap: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  title: { flex: 1, fontSize: 18, lineHeight: 20 },
  card: { gap: space3, padding: space3, borderRadius: 14 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: space1 },
  pressed: { opacity: 0.7 },
});
