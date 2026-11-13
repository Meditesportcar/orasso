import { describe, expect, it } from "vitest";
import { createAlbumTurn, holdsLeave, removalRoute } from "./albumTurn";

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

describe("la sortie de l'écran", () => {
  it("retenue seulement pendant une opération d'un formulaire vivant ; une sortie voulue ou un formulaire mort passe", () => {
    expect(holdsLeave({ busy: true, leaving: false, alive: true })).toBe(true);
    expect(holdsLeave({ busy: false, leaving: false, alive: true })).toBe(false);
    // La navigation d'une publication réussie (`leaving`) passe, tour tenu.
    expect(holdsLeave({ busy: true, leaving: true, alive: true })).toBe(false);
    // Compte changé pendant l'opération : mort, plus rien ne retient la sortie.
    expect(holdsLeave({ busy: true, leaving: false, alive: false })).toBe(false);
  });

  it("un formulaire mort pendant la publication rend son tour : la sortie est libre ensuite", () => {
    let current = true;
    const turn = createAlbumTurn(() => current);
    const token = turn.take();
    current = false;
    expect(holdsLeave({ busy: turn.busy(), leaving: false, alive: turn.alive() })).toBe(false);
    turn.end(token);
    expect(turn.busy()).toBe(false);
  });
});

describe("la sélection de photos tient le tour", () => {
  it("sélecteur ouvert (conversion retardée) : « Continuer » et un retrait ne prennent rien ; le tour rendu, ils passent", async () => {
    const turn = createAlbumTurn();
    const picking = turn.take();
    let released = false;
    const conversion = new Promise<void>((resolve) => setTimeout(resolve, 20)).then(() => {
      released = turn.end(picking);
    });
    // Pendant la sélection : « Continuer » (envoi/lecture) et un retrait ne passent pas.
    expect(turn.take()).toBeNull();
    await conversion;
    expect(released).toBe(true);
    expect(turn.take()).not.toBeNull();
  });
});
