// « Vu » de l'Activité (lot R7c2, tour 2) : la pastille de la cloche ne tombe que si l'Activité est **à l'écran** (focus) et
// que la liste vient d'être lue **avec succès**. Une notification reçue pendant qu'une fiche est ouverte par-dessus
// n'est pas vue (la personne ne l'a pas regardée) : le « vu » est dû et se pose au retour sur l'Activité, après une lecture
// réussie. Une lecture échouée ne vaut pas « vu » : il reste dû.
export type SeenGate = {
  /** Du nouveau est arrivé (notification) : un « vu » est dû. */
  owe: () => void;
  /** `true` si le « vu » doit être posé maintenant (et solde ce « vu »). */
  settle: (read: { ok: boolean; focused: boolean }) => boolean;
  owed: () => boolean;
};

export function createSeenGate(): SeenGate {
  let owed = true;
  return {
    owe: () => {
      owed = true;
    },
    settle: ({ ok, focused }) => {
      if (!owed || !ok || !focused) return false;
      owed = false;
      return true;
    },
    owed: () => owed,
  };
}
