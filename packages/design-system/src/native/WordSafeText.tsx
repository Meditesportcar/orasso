// Lot R6-police (« abonnement / s » sur le Pixel de Damien, police système agrandie) : un petit libellé (sous le chiffre
// d'un compteur) ne se coupe jamais au milieu d'un mot. Même mesure que les boutons (`useWordSafeLabel`) : rien ne
// change tant qu'aucun mot n'est coupé ; sinon le corps baisse d'un pixel à la fois jusqu'au plancher.
// `WordSafeGroup` : les libellés d'une même rangée (abonnés, abonnements, sorties) gardent le même corps, le plus petit
// qu'il a fallu à l'un d'eux.

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Text, type TextProps } from "./text";
import { useWordSafeLabel } from "./useWordSafeLabel";

/** Plancher d'un libellé de compteur (corps de base, avant l'échelle de police du système). */
export const COUNTER_LABEL_MIN = 8;

type Group = { size: number | null; report: (id: number, size: number | null) => void };
const GroupContext = createContext<Group | null>(null);
let nextId = 0;

/** Une rangée de libellés qui partagent le même corps. */
export function WordSafeGroup({ children }: { children: ReactNode }) {
  const [sizes, setSizes] = useState<Readonly<Record<number, number>>>({});
  const report = useMemo(
    () => (id: number, size: number | null) =>
      setSizes((prev) => {
        if (size === null) {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return prev[id] === size ? prev : { ...prev, [id]: size };
      }),
    [],
  );
  const values = Object.values(sizes);
  const size = values.length > 0 ? Math.min(...values) : null;
  const value = useMemo(() => ({ size, report }), [size, report]);
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export type WordSafeTextProps = TextProps & {
  /** Corps de base du libellé (celui de son style). */
  base: number;
  /** Plancher ; `COUNTER_LABEL_MIN` par défaut. */
  min?: number;
};

/** Un texte qui ne se coupe jamais au milieu d'un mot (corps réduit au besoin, partagé dans un `WordSafeGroup`). */
export function WordSafeText({ base, min = COUNTER_LABEL_MIN, style, children, ...rest }: WordSafeTextProps) {
  const fit = useWordSafeLabel(base, children, min);
  const group = useContext(GroupContext);
  const id = useRef(-1);
  if (id.current < 0) id.current = nextId++;
  const report = group?.report;
  useEffect(() => {
    report?.(id.current, fit.fontSize);
  }, [report, fit.fontSize]);
  useEffect(() => () => report?.(id.current, null), [report]);
  const size = group?.size ?? fit.fontSize;
  return (
    <Text {...rest} {...fit.textProps} style={[style, size !== null ? { fontSize: size } : null]}>
      {children}
    </Text>
  );
}
