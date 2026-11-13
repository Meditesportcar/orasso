import { describe, expect, it } from "vitest";
import { createAlbumTurn, removalRoute } from "./albumTurn";

describe("le tour d'un album : un propriétaire", () => {
  it("une seule opération à la fois ; le tour se rend à son jeton, jamais à un autre", () => {
    const turn = createAlbumTurn();
    const first = turn.take();
    expect(first).not.toBeNull();
    expect(turn.busy()).toBe(true);
    // Une seconde opération ne prend rien.
    expect(turn.take()).toBeNull();
    // Un jeton qui n'est pas celui du propriétaire ne rend rien : le tour reste tenu.
    expect(turn.end({ n: 999 })).toBe(false);
    expect(turn.end(null)).toBe(false);
    expect(turn.busy()).toBe(true);
    expect(turn.end(first)).toBe(true);
    expect(turn.busy()).toBe(false);
    // Le jeton rendu ne sert plus : il ne libère pas le tour d'une opération suivante.
    const second = turn.take();
    expect(turn.end(first)).toBe(false);
    expect(turn.holds(second)).toBe(true);
    expect(turn.busy()).toBe(true);
  });

  it("« Continuer » tient le tour : l'envoi qu'il lance et la lecture suivante restent sous son jeton, le retrait concurrent ne passe pas", () => {
    const turn = createAlbumTurn();
    const continuer = turn.take();
    // L'envoi (tour tenu) s'achève : il ne rend pas le tour (il ne le possède pas).
    expect(turn.end(null)).toBe(false);
    // Pendant la lecture de l'album, un retrait ou une publication ne prennent pas le tour.
    expect(turn.take()).toBeNull();
    expect(turn.holds(continuer)).toBe(true);
    turn.end(continuer);
    expect(turn.take()).not.toBeNull();
  });

  it("changement de compte pendant une opération : mort, aucun tour ; retour au compte d'origine : toujours mort", () => {
    let current = "A";
    const turn = createAlbumTurn(() => current === "A");
    const op = turn.take();
    expect(turn.alive()).toBe(true);
    current = "B";
    expect(turn.alive()).toBe(false);
    // L'opération en vol rend son tour, mais plus rien ne part.
    expect(turn.end(op)).toBe(true);
    expect(turn.take()).toBeNull();
    // A → B → A : la mort est définitive.
    current = "A";
    expect(turn.alive()).toBe(false);
    expect(turn.isDead()).toBe(true);
    expect(turn.take()).toBeNull();
  });

  it("`kill` : l'annonce d'un autre compte tue le formulaire sans attendre la prochaine question", () => {
    const turn = createAlbumTurn();
    turn.kill();
    expect(turn.alive()).toBe(false);
    expect(turn.take()).toBeNull();
  });
});

describe("la garde de retrait commune", () => {
  it("un envoi en vol : bloqué ; aucun envoi commencé : local ; ajout parti (même sans réponse) ou ajoutée : par le serveur", () => {
    expect(removalRoute({}, true)).toBe("blocked");
    expect(removalRoute({ attempted: true, photoId: "p" }, true)).toBe("blocked");
    expect(removalRoute({}, false)).toBe("local");
    expect(removalRoute({ attempted: true }, false)).toBe("server");
    expect(removalRoute({ photoId: "p" }, false)).toBe("server");
  });
});
