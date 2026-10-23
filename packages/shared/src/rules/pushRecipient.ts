// Destinataire d'un push (lot M6, tour 3, vie privée) : un identifiant opaque du compte, jamais l'e-mail ni l'identifiant
// lui-même. L'API le met dans chaque push ; l'appli le recalcule pour le compte ouvert et n'annonce rien si ce n'est pas
// le même (un push de A reçu après la connexion de B).
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** 16 caractères hexadécimaux de SHA-256(« orasso-push: » + identifiant du compte). */
export function pushRecipientId(userId: string): string {
  return bytesToHex(sha256(utf8ToBytes(`orasso-push:${userId}`))).slice(0, 16);
}

/** Le push est-il pour le compte ouvert ? Sans session ou sans destinataire : non. */
export function pushIsForAccount(recipient: unknown, userId: string | null | undefined): boolean {
  return typeof recipient === "string" && Boolean(userId) && recipient === pushRecipientId(userId ?? "");
}
