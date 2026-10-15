// Les trois sons du résultat de scan : un son bref (OK), deux bips (déjà entré), un son grave (refusé).
// Sons PROVISOIRES générés par scripts/generate-scan-sounds.mjs ; remplacer les trois fichiers de sounds/ suffit.

import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import type { ScanResultState } from "../labels";

export const scanSoundFiles: Record<ScanResultState, number> = {
  ok: require("./sounds/ok.wav"),
  duplicate: require("./sounds/duplicate.wav"),
  refused: require("./sounds/refused.wav"),
};

const players = new Map<ScanResultState, AudioPlayer>();

/** Joue le son d'un résultat de scan. Ne lève jamais : un appareil muet ou un lecteur absent ne bloque pas le scan. */
export function playScanSound(state: ScanResultState): void {
  try {
    let player = players.get(state);
    if (!player) {
      player = createAudioPlayer(scanSoundFiles[state]);
      players.set(state, player);
    }
    player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // Pas de son : la couleur et la forme suffisent à lire le résultat.
  }
}
