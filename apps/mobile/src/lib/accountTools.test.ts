// Lot 35c : export des données et clés d'accès dans l'appli.
import { describe, expect, it } from "vitest";

import {
  exportFileName,
  exportText,
  PASSKEY_SESSION_MESSAGE,
  passkeyErrorMessage,
  passkeyKind,
  passkeyNameIssue,
  passkeyTitle,
} from "./accountTools";

/** Même forme que `ApiRequestError` (le client HTTP importe React Native, absent des tests). */
class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

describe("export des données", () => {
  it("le fichier porte la date du jour de Paris", () => {
    expect(exportFileName(new Date("2026-10-17T10:00:00Z"))).toBe("orasso-mes-donnees-2026-10-17.json");
    // 23 h 30 UTC = déjà le lendemain à Paris.
    expect(exportFileName(new Date("2026-10-17T23:30:00Z"))).toBe("orasso-mes-donnees-2026-10-18.json");
  });

  it("le contenu est un JSON indenté qui se relit à l'identique", () => {
    const data = { profile: { pseudo: "Kenji" }, vehicles: [] };
    const text = exportText(data);
    expect(text).toContain('\n  "profile"');
    expect(JSON.parse(text)).toEqual(data);
  });
});

describe("clés d'accès", () => {
  it("nom : obligatoire, 60 caractères au plus", () => {
    expect(passkeyNameIssue("  ")).toBe("Donne un nom à la clé.");
    expect(passkeyNameIssue("iPhone de Damien")).toBeNull();
    expect(passkeyNameIssue("x".repeat(61))).toContain("trop long");
  });

  it("titre et type de la clé", () => {
    expect(passkeyTitle({ name: " Pixel " })).toBe("Pixel");
    expect(passkeyTitle({ name: null })).toBe("Clé d'accès");
    expect(passkeyKind("multiDevice")).toBe("Synchronisée entre tes appareils");
    expect(passkeyKind("singleDevice")).toBe("Reste sur son appareil");
  });

  it("messages d'erreur : session sans second facteur, clé inconnue, réseau", () => {
    expect(passkeyErrorMessage(new ApiRequestError(403, "FORBIDDEN", "x"))).toBe(PASSKEY_SESSION_MESSAGE);
    expect(passkeyErrorMessage(new ApiRequestError(400, "PASSKEY_NOT_FOUND", "x"))).toBe("Clé introuvable.");
    expect(passkeyErrorMessage(new ApiRequestError(0, "network", "Pas de connexion"))).toBe("Pas de connexion");
    expect(passkeyErrorMessage(new Error("boom"))).toBe("Une erreur est survenue. Réessaie.");
  });
});
