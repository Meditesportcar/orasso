import { describe, expect, it } from "vitest";

import { forgetSender, rememberSender, senderOf } from "./sendActors";

describe("sendActors : un réessai part au nom de l'acteur du premier envoi", () => {
  it("échec sous A, passage à B, réessai → au nom de A", () => {
    rememberSender("c1", "s:a");
    expect(senderOf("c1", "s:b")).toBe("s:a");
    forgetSender("c1");
    expect(senderOf("c1", "s:b")).toBe("s:b");
  });
  it("et l'inverse : écrit en personne (nul), réessayé sous une casquette → toujours la personne", () => {
    rememberSender("c2", null);
    expect(senderOf("c2", "s:b")).toBeNull();
    forgetSender("c2");
  });
  it("un envoi inconnu prend l'acteur courant", () => {
    expect(senderOf("inconnu", "p:x")).toBe("p:x");
  });
});
