// Luminosité au maximum tant que le QR d'accès est à l'écran (lot M4, maquette 5.1, retour 26). Tour 2 (relecture
// Codex) : elle suit ce qui est **voulu** (QR affiché, écran au premier plan, appli active), pas le montage de l'écran :
// « Sur la carte » ou une autre route la rend. Les opérations passent l'une après l'autre (augmenter, rendre) et une
// augmentation en attente est annulée dès que ce n'est plus voulu (passage en arrière-plan pendant la lecture de la
// valeur d'avant : elle ne remonte jamais à 100 %). Logique pure, testée sans React Native (`brightness.test.ts`).

/** Ce que l'appareil sait faire (`expo-brightness`), ou `null` quand le module natif manque (ancien APK). */
export type BrightnessApi = {
  get: () => Promise<number>;
  set: (value: number) => Promise<void>;
  /** Android : la fenêtre de l'appli suit de nouveau le réglage du téléphone (iPhone : on remet la valeur d'avant). */
  restoreSystem?: () => Promise<void>;
};

export type BrightnessController = {
  /** Voulu ou non. La promesse se résout quand l'opération demandée est passée (utile aux tests). */
  want: (next: boolean) => Promise<void>;
};

export function createBrightnessController(load: () => Promise<BrightnessApi | null>): BrightnessController {
  let wanted = false;
  // Chaque changement de souhait invalide l'augmentation en attente.
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();
  let raised = false;
  let before: number | null = null;

  const run = (op: (api: BrightnessApi) => Promise<void>) => {
    queue = queue.then(async () => {
      const api = await load().catch(() => null);
      if (!api) return;
      try {
        await op(api);
      } catch {
        // Module absent ou refus : le QR reste lisible, sans plus.
      }
    });
    return queue;
  };

  return {
    want(next) {
      if (next === wanted) return queue;
      wanted = next;
      const gen = ++generation;
      if (next) {
        return run(async (api) => {
          if (gen !== generation) return;
          const value = await api.get();
          // Plus voulu pendant la lecture (arrière-plan, autre écran) : on ne monte pas.
          if (gen !== generation) return;
          if (!raised) before = value;
          await api.set(1);
          raised = true;
        });
      }
      return run(async (api) => {
        if (!raised) return;
        raised = false;
        if (api.restoreSystem) await api.restoreSystem();
        else if (before !== null) await api.set(before);
        before = null;
      });
    },
  };
}
