// Feuilles posées par un bloc d'écran (lot 35c). Une feuille est un voile qui couvre l'écran : rendue dans une zone qui
// défile, elle ne couvrirait que le contenu. `<Overlay>` envoie donc ses enfants à la zone des feuilles de l'écran
// (`TabScreen` et `FlowScreen` la montent après leurs `overlays`), ce qui laisse un bloc garder ses feuilles près de ses
// boutons sans remonter leur état jusqu'à l'écran.
import { createContext, Fragment, type ReactNode, useContext, useEffect, useId, useState } from "react";

type Setter = (id: string, node: ReactNode | null) => void;
const SetterContext = createContext<Setter | null>(null);
const NodesContext = createContext<Record<string, ReactNode>>({});
// Vrai pour tout ce qui est rendu dans la zone des feuilles : une feuille y est déjà à sa place, elle ne repart pas ailleurs.
const InSlotContext = createContext(false);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Record<string, ReactNode>>({});
  // Fonction stable : un bloc qui change d'état ne réveille pas les autres.
  const [set] = useState<Setter>(
    () => (id: string, node: ReactNode | null) =>
      setNodes((prev) => {
        if (node === null) {
          if (!(id in prev)) return prev;
          const { [id]: _removed, ...rest } = prev;
          return rest;
        }
        return prev[id] === node ? prev : { ...prev, [id]: node };
      }),
  );
  return (
    <SetterContext.Provider value={set}>
      <NodesContext.Provider value={nodes}>{children}</NodesContext.Provider>
    </SetterContext.Provider>
  );
}

/** La zone des feuilles : à poser une fois, au-dessus du contenu de l'écran. */
export function OverlaySlot() {
  const nodes = useContext(NodesContext);
  return (
    <InSlotContext.Provider value>
      {Object.entries(nodes).map(([id, node]) => (
        <Fragment key={id}>{node}</Fragment>
      ))}
    </InSlotContext.Provider>
  );
}

/** Les enfants s'affichent dans la zone des feuilles de l'écran ; rien là où l'élément est posé. */
export function Overlay({ children }: { children: ReactNode }) {
  const id = useId();
  const set = useContext(SetterContext);
  useEffect(() => {
    set?.(id, children);
  });
  useEffect(() => () => set?.(id, null), [id, set]);
  return null;
}

/**
 * Une feuille couvre toujours l’écran, où qu’elle soit écrite : sous un `OverlayProvider` et hors de la zone des feuilles,
 * les enfants partent dans cette zone (comme `<Overlay>`) ; sans zone, ou déjà dedans, ils restent sur place.
 */
export function SheetPortal({ children }: { children: ReactNode }) {
  const inSlot = useContext(InSlotContext);
  const set = useContext(SetterContext);
  if (inSlot || !set) return <>{children}</>;
  return <Overlay>{children}</Overlay>;
}
