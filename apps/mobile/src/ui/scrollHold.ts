// Doigts posés sur une carte qui « tient » la page (lot 59c, tour 2 des relectures) : logique pure, testée seule.
// On suit les identifiants des doigts posés sur la carte : un doigt resté ailleurs sur l'écran ne garde plus la page
// bloquée, et la carte qui disparaît (démontage) la rend toujours.

export type TouchHold = {
  /** Doigts qui se posent sur la carte (`changedTouches` de `onTouchStart`). */
  start: (ids: readonly (string | number)[]) => void;
  /** Doigts levés (`onTouchEnd`, l'évènement va à la vue où le doigt s'est posé, même levé ailleurs). */
  end: (ids: readonly (string | number)[]) => void;
  /** Geste annulé, ou carte démontée : tout est rendu. */
  cancel: () => void;
};

export function createTouchHold(onChange: (held: boolean) => void): TouchHold {
  const down = new Set<string | number>();
  return {
    start: (ids) => {
      const was = down.size;
      for (const id of ids) down.add(id);
      if (was === 0 && down.size > 0) onChange(true);
    },
    end: (ids) => {
      const was = down.size;
      for (const id of ids) down.delete(id);
      if (was > 0 && down.size === 0) onChange(false);
    },
    cancel: () => {
      if (down.size === 0) return;
      down.clear();
      onChange(false);
    },
  };
}
