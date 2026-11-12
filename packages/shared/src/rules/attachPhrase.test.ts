import { describe, expect, it } from "vitest";

import { attachVerb } from "../labels/feedPublish.fr";
import { attachPhrase, FEMININE_TITLE_WORDS } from "./attachPhrase";

describe("attachPhrase : l'accord du verbe avec le titre", () => {
  it("masculin par défaut : les mots de la maquette, un par rôle", () => {
    expect(attachPhrase("organizer", "before", "Rassemblement du Lydia")).toBe("pour le Rassemblement du Lydia");
    expect(attachPhrase("on_site", "running", "Rassemblement du Lydia")).toBe("présent au Rassemblement du Lydia");
    expect(attachPhrase("attendee", "before", "Rassemblement du Lydia")).toBe("sera au Rassemblement du Lydia");
    expect(attachPhrase("attendee", "after", "Rassemblement du Lydia")).toBe("était au Rassemblement du Lydia");
    expect(attachPhrase("attendee", "running", "Rassemblement du Lydia")).toBe("est au Rassemblement du Lydia");
  });

  it("le masculin redonne exactement `attachVerb` (R8p) suivi du titre", () => {
    for (const [role, phase] of [
      ["organizer", "before"],
      ["on_site", "after"],
      ["attendee", "before"],
      ["attendee", "running"],
      ["attendee", "after"],
    ] as const) {
      expect(attachPhrase(role, phase, "Salon de printemps")).toBe(`${attachVerb(role, phase)} Salon de printemps`);
    }
  });

  it("féminin : un premier mot de la liste (accents et casse ignorés)", () => {
    expect(attachPhrase("organizer", "before", "Balade de Prades")).toBe("pour la Balade de Prades");
    expect(attachPhrase("on_site", "before", "Nocturne de Canet")).toBe("présent à la Nocturne de Canet");
    expect(attachPhrase("attendee", "before", "Montée de Prats")).toBe("sera à la Montée de Prats");
    expect(attachPhrase("attendee", "after", "MONTÉE historique")).toBe("était à la MONTÉE historique");
    for (const word of FEMININE_TITLE_WORDS) {
      const elided = /^[aeiou]/.test(word.normalize("NFD").toLowerCase());
      expect(attachPhrase("on_site", "before", `${word} du port`)).toBe(
        elided ? `présent à l'${word} du port` : `présent à la ${word} du port`,
      );
    }
    expect(attachPhrase("organizer", "before", "Exposition du port")).toBe("pour l'Exposition du port");
    expect(attachPhrase("attendee", "before", "Expo du port")).toBe("sera à l'Expo du port");
  });

  it("voyelle : élision, sans espace ; « h » muet seulement pour des mots français connus ; « y » reste consonne", () => {
    expect(attachPhrase("organizer", "before", "Anciennes du port")).toBe("pour l'Anciennes du port");
    expect(attachPhrase("on_site", "before", "Open de Perpignan")).toBe("présent à l'Open de Perpignan");
    expect(attachPhrase("attendee", "after", "Hivernale de Font-Romeu")).toBe("était à l'Hivernale de Font-Romeu");
    expect(attachPhrase("on_site", "before", "Historique de Céret")).toBe("présent à l'Historique de Céret");
    expect(attachPhrase("on_site", "before", "Hot Rod Day")).toBe("présent au Hot Rod Day");
    expect(attachPhrase("organizer", "before", "Harley Days")).toBe("pour le Harley Days");
    expect(attachPhrase("on_site", "before", "Youngtimers")).toBe("présent au Youngtimers");
  });

  it("un titre qui commence par un article : l'article passe dans la préposition", () => {
    expect(attachPhrase("organizer", "before", "Le Mans Classic")).toBe("pour le Mans Classic");
    expect(attachPhrase("on_site", "before", "Le Mans Classic")).toBe("présent au Mans Classic");
    expect(attachPhrase("attendee", "before", "La Nuit des Légendes")).toBe("sera à la Nuit des Légendes");
    expect(attachPhrase("organizer", "before", "La Fête du Moteur")).toBe("pour la Fête du Moteur");
    expect(attachPhrase("on_site", "before", "Les Rencontres de Céret")).toBe("présent aux Rencontres de Céret");
    expect(attachPhrase("organizer", "before", "Les Rencontres de Céret")).toBe("pour les Rencontres de Céret");
    expect(attachPhrase("attendee", "after", "L'Auto Rétro")).toBe("était à l'Auto Rétro");
    expect(attachPhrase("organizer", "before", "L’Auto Rétro")).toBe("pour l'Auto Rétro");
  });

  it("l'article du titre l'emporte sur la liste des noms féminins", () => {
    expect(attachPhrase("on_site", "before", "Le Nuit Blanche Club")).toBe("présent au Nuit Blanche Club");
  });

  it("sans rôle : le titre seul, sans verbe", () => {
    expect(attachPhrase(null, "after", "Rassemblement du Lydia")).toBe("Rassemblement du Lydia");
    expect(attachPhrase(null, "before", "Balade de Prades")).toBe("Balade de Prades");
  });

  it("espaces autour du titre ignorés, titre vide : rien", () => {
    expect(attachPhrase("organizer", "before", "  Balade de Prades ")).toBe("pour la Balade de Prades");
    expect(attachPhrase("organizer", "before", "   ")).toBe("");
  });

  it("un mot qui commence comme un article mais n'en est pas un reste masculin", () => {
    expect(attachPhrase("on_site", "before", "Lemans Night")).toBe("présent au Lemans Night");
    expect(attachPhrase("organizer", "before", "Lesbos Cars")).toBe("pour le Lesbos Cars");
  });
});
