// Gestionnaire `onLayout` d'une barre de progression : la largeur est lue tout de suite, avant la mise à jour d'état.
// React Native recycle l'événement une fois le gestionnaire revenu ; lire `nativeEvent` dans la fonction de mise à jour
// (exécutée plus tard) plante dès qu'un auteur a au moins deux stories.
export type TrackWidths = Record<number, number>;

export function trackLayout(
  setWidths: (update: (w: TrackWidths) => TrackWidths) => void,
  i: number,
): (e: { nativeEvent: { layout: { width: number } } }) => void {
  return (e) => {
    const width = e.nativeEvent.layout.width;
    setWidths((w) => ({ ...w, [i]: width }));
  };
}
