// Attente d'une donnée (lot M3, fluidité) : des squelettes à la place exacte de ce qui va venir, jamais un écran vide ;
// si l'attente dure (au-delà de `LONG_WAIT_MS`), le O vivant de l'artefact (`OLoader`) se pose au-dessus. Jamais de roue.
import { OLoader, Skeleton, tokens } from "@orasso/design-system/native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

const { space2, space3 } = tokens.spacing;

/** Au-delà, l'attente « dure » : le O vivant rejoint les squelettes. */
export const LONG_WAIT_MS = 1500;

/** Vrai quand l'attente dure depuis `LONG_WAIT_MS`. */
export function useLongWait(waiting: boolean): boolean {
  const [long, setLong] = useState(false);
  useEffect(() => {
    if (!waiting) {
      setLong(false);
      return;
    }
    const timer = setTimeout(() => setLong(true), LONG_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  return long;
}

/** Les squelettes d'une attente : une plaque par hauteur de `blocks`, puis le O vivant si ça dure. */
export function Waiting({ blocks, label, testID }: { blocks: readonly number[]; label?: string; testID?: string }) {
  const long = useLongWait(true);
  return (
    <View style={styles.wrap} testID={testID ?? "waiting"}>
      {long ? (
        <View style={styles.loader}>
          <OLoader label={label} />
        </View>
      ) : null}
      {blocks.map((height, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: plaques fixes, sans identité.
        <Skeleton key={i} height={height} />
      ))}
    </View>
  );
}

/** Squelettes d'une liste de cartes d'événement (la première en vedette, comme l'Explorer). */
export const EVENT_LIST_BLOCKS = [420, 150, 150] as const;
/** Squelettes des tickets de Sorties. */
export const TICKET_BLOCKS = [170, 170] as const;
/** Squelettes du détail d'une fiche (organisateur, faits, créneaux). */
export const DETAIL_BLOCKS = [72, 160, 96] as const;

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  loader: { alignItems: "center", paddingVertical: space2 },
});
