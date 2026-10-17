// Vérification d'une structure (docs/01 « Organisateurs : la structure », bloc 1 : vérification minimaliste en deux
// étapes) : 1. numéro SIRET ou RNA contrôlé automatiquement dans le registre public ; 2. justificatif (statuts,
// récépissé, Kbis, pièce d'identité d'un responsable pour un club non déclaré) validé à la main par l'équipe Orasso.
// Les justificatifs sont des fichiers privés (`private/…`), lus par l'administration seulement ; la pièce d'identité
// est supprimée dès la validation.
import { randomBytes } from "node:crypto";
import {
  type AdminStructureRow,
  canSubmitVerification,
  parseRegistryNumber,
  type StructureVerificationView,
  type VerificationDocument,
  type VerificationDocumentKind,
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import {
  adminAuditLog,
  profiles,
  structureMembers,
  structures,
  structureVerificationDocuments,
  user,
} from "../../db/schema";
import { env } from "../../env";
import { requireOrganizer, requirePlatformRole } from "../../lib/access";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import { mail, renderMail } from "../../lib/mail";
import { rateLimit } from "../../lib/rateLimit";
import { lookupRegistry } from "../../lib/registry";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { structureById } from "./service";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 8;

const docOf = (d: typeof structureVerificationDocuments.$inferSelect): VerificationDocument => ({
  id: d.id,
  kind: d.kind,
  fileName: d.fileName,
  sizeBytes: d.sizeBytes,
  createdAt: d.createdAt.toISOString(),
});

/** Type réel du fichier d'après ses premiers octets (le type annoncé par le navigateur ne compte pas). */
export function sniffDocument(data: Buffer): { ext: string; contentType: string } | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", contentType: "application/pdf" };
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", contentType: "image/png" };
  }
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

async function documentsOf(structureId: string) {
  return db.query.structureVerificationDocuments.findMany({
    where: eq(structureVerificationDocuments.structureId, structureId),
    orderBy: [asc(structureVerificationDocuments.createdAt)],
  });
}

/**
 * Vérifiée : rien à refaire. Suspendue (badge échu ou décision de l'équipe, lot 27) : aucune démarche de l'organisateur
 * ne la rétablit — sinon elle passerait en « en cours » et tous les gardes de la suspension s'ouvriraient. Seule
 * l'équipe Orasso la rétablit (renouvellement ou levée), conformément à docs/01 (« l'équipe prend contact »).
 */
function assertCanEditVerification(s: { verification: string }) {
  if (s.verification === "verified") throw conflict("conflict", "Structure déjà vérifiée");
  if (s.verification === "suspended") {
    throw conflict("conflict", "Structure suspendue : écris à l'équipe Orasso, elle la rétablit.");
  }
}

export const verificationService = {
  /** `GET /structures/:id/verification` */
  async view(v: Viewer, id: string): Promise<StructureVerificationView> {
    await requireOrganizer(v, id);
    const s = await structureById(id);
    const docs = await documentsOf(id);
    const can = canSubmitVerification(
      s.registryCheck,
      docs.map((d) => d.kind),
    );
    return {
      verification: s.verification,
      verifiedAt: s.verifiedAt?.toISOString() ?? null,
      badgeExpiresAt: s.badgeExpiresAt?.toISOString() ?? null,
      siret: s.siret,
      rna: s.rna,
      registryCheck: s.registryCheck,
      documents: docs.map(docOf),
      canSubmit: can.ok && s.verification === "unverified",
      submitBlockedReason: can.ok ? null : can.reason,
    };
  },

  /** `POST /structures/:id/verification/check` : numéro saisi → registre public → résultat gardé sur la structure. */
  async check(v: Viewer, id: string, number: string) {
    await requireOrganizer(v, id);
    const s = await structureById(id);
    assertCanEditVerification(s);
    const parsed = parseRegistryNumber(number);
    if ("error" in parsed) throw validation(parsed.error, { fields: { number: parsed.error } });
    rateLimit("registryCheck", v.user.id);
    const check = await lookupRegistry(parsed.source, parsed.value);
    // Le numéro n'est gardé sur la structure que s'il est reconnu : un numéro d'un autre ne reste pas affiché.
    const keep = check.status === "matched" || check.status === "closed";
    await db
      .update(structures)
      .set({
        registryCheck: check,
        ...(keep
          ? {
              siret: check.siret ?? s.siret,
              rna: check.rna ?? s.rna,
            }
          : {}),
      })
      .where(eq(structures.id, id));
    return this.view(v, id);
  },

  /** `POST /structures/:id/verification/documents` (multipart : `file`, `kind`). */
  async addDocument(v: Viewer, id: string, kind: VerificationDocumentKind, file: File) {
    await requireOrganizer(v, id);
    const s = await structureById(id);
    assertCanEditVerification(s);
    rateLimit("fileUpload", v.user.id);
    if (file.size === 0) throw validation("Fichier vide");
    if (file.size > MAX_DOCUMENT_BYTES) throw new AppError(413, "payload_too_large", "Fichier de 10 Mo au plus");
    const data = Buffer.from(await file.arrayBuffer());
    const kindOf = sniffDocument(data);
    if (!kindOf) throw new AppError(415, "unsupported_media_type", "PDF, JPEG, PNG ou WebP seulement");
    if ((await documentsOf(id)).length >= MAX_DOCUMENTS)
      throw conflict("conflict", `${MAX_DOCUMENTS} justificatifs au plus`);
    const key = `private/verification/${id}/${randomBytes(12).toString("hex")}.${kindOf.ext}`;
    await storage.put(key, data);
    const [row] = await db
      .insert(structureVerificationDocuments)
      .values({
        structureId: id,
        kind,
        storageKey: key,
        fileName: (file.name || `justificatif.${kindOf.ext}`).replace(/[^\w.\- ()]/g, "_").slice(0, 120),
        contentType: kindOf.contentType,
        sizeBytes: data.length,
        uploadedBy: v.user.id,
      })
      .returning();
    if (!row) throw new Error("Justificatif non enregistré");
    return docOf(row);
  },

  /** Retrait d'un justificatif envoyé par erreur (avant la validation). */
  async removeDocument(v: Viewer, id: string, documentId: string) {
    await requireOrganizer(v, id);
    const s = await structureById(id);
    assertCanEditVerification(s);
    // Un justificatif déposé par l'équipe Orasso (transfert de propriétaire, lot 27) ne s'efface pas côté organisateur.
    const [existing] = await db
      .select({ uploader: profiles.platformRole })
      .from(structureVerificationDocuments)
      .leftJoin(profiles, eq(profiles.userId, structureVerificationDocuments.uploadedBy))
      .where(
        and(eq(structureVerificationDocuments.id, documentId), eq(structureVerificationDocuments.structureId, id)),
      );
    if (existing?.uploader && existing.uploader !== "user") {
      throw new AppError(403, "forbidden", "Ce justificatif a été déposé par l'équipe Orasso.");
    }
    const [doc] = await db
      .delete(structureVerificationDocuments)
      .where(and(eq(structureVerificationDocuments.id, documentId), eq(structureVerificationDocuments.structureId, id)))
      .returning();
    if (!doc) throw notFound("Justificatif introuvable");
    await storage.remove(doc.storageKey);
  },

  /** `POST /structures/:id/verification/submit` : la structure passe « en cours », elle apparaît dans la file de l'administration. */
  async submit(v: Viewer, id: string) {
    await requireOrganizer(v, id);
    const s = await structureById(id);
    if (s.verification === "pending") throw conflict("conflict", "Vérification déjà en cours");
    assertCanEditVerification(s);
    const docs = await documentsOf(id);
    const can = canSubmitVerification(
      s.registryCheck,
      docs.map((d) => d.kind),
    );
    if (!can.ok) throw validation(can.reason);
    await db.update(structures).set({ verification: "pending" }).where(eq(structures.id, id));
    return this.view(v, id);
  },

  // --- Administration -------------------------------------------------------------------------------------------

  /** `GET /admin/structures?status=pending|all` : la file des structures à vérifier (super admin). */
  async adminList(v: Viewer, status: "pending" | "all"): Promise<AdminStructureRow[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select()
      .from(structures)
      .where(
        and(isNull(structures.deletedAt), status === "pending" ? eq(structures.verification, "pending") : undefined),
      )
      .orderBy(desc(structures.updatedAt))
      .limit(200);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const docs = await db
      .select()
      .from(structureVerificationDocuments)
      .where(inArray(structureVerificationDocuments.structureId, ids))
      .orderBy(asc(structureVerificationDocuments.createdAt));
    const owners = await db
      .select({ structureId: structureMembers.structureId, pseudo: profiles.pseudo, email: user.email })
      .from(structureMembers)
      .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
      .innerJoin(user, eq(user.id, structureMembers.userId))
      .where(
        and(
          inArray(structureMembers.structureId, ids),
          eq(structureMembers.role, "owner"),
          eq(structureMembers.status, "active"),
        ),
      );
    return rows.map((s) => {
      const owner = owners.find((o) => o.structureId === s.id);
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        kind: s.kind,
        verification: s.verification,
        createdAt: s.createdAt.toISOString(),
        owner: owner ? { pseudo: owner.pseudo, email: owner.email } : null,
        siret: s.siret,
        rna: s.rna,
        registryCheck: s.registryCheck,
        documents: docs.filter((d) => d.structureId === s.id).map(docOf),
        city: s.city,
        department: s.department,
      };
    });
  },

  /** `GET /admin/verification-documents/:id` : le fichier d'un justificatif, avec trace au journal d'administration. */
  async adminDocument(v: Viewer, documentId: string, ip: string | null) {
    await requirePlatformRole(v, "super_admin");
    const doc = await db.query.structureVerificationDocuments.findFirst({
      where: eq(structureVerificationDocuments.id, documentId),
    });
    if (!doc) throw notFound("Justificatif introuvable");
    const data = await storage.get(doc.storageKey);
    if (!data) throw notFound("Fichier introuvable");
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "structure.document.view",
      targetType: "structure_document",
      targetId: doc.id,
      structureId: doc.structureId,
      ip,
    });
    return { data, doc };
  },

  /**
   * Suite d'une décision de l'administration : la pièce d'identité est supprimée dès la validation (docs/01), et le
   * propriétaire est prévenu par e-mail (la décision, et le motif si la structure est refusée).
   */
  async afterDecision(structureId: string, verified: boolean, note: string | null) {
    const s = await structureById(structureId);
    if (verified) {
      const identities = await db
        .delete(structureVerificationDocuments)
        .where(
          and(
            eq(structureVerificationDocuments.structureId, structureId),
            eq(structureVerificationDocuments.kind, "identity"),
          ),
        )
        .returning();
      for (const d of identities) await storage.remove(d.storageKey);
    }
    const owner = await db
      .select({ email: user.email })
      .from(structureMembers)
      .innerJoin(user, eq(user.id, structureMembers.userId))
      .where(
        and(
          eq(structureMembers.structureId, structureId),
          eq(structureMembers.role, "owner"),
          eq(structureMembers.status, "active"),
        ),
      )
      .then((r) => r[0]);
    if (!owner) return;
    const url = `${env.PUBLIC_URL}/orga/${s.slug}/structure`;
    await mail.send(
      "structure_verification",
      owner.email,
      verified
        ? renderMail(
            `${s.name} est vérifiée`,
            ["Ta structure porte maintenant le badge « Structure vérifiée » : tu peux publier tes événements."],
            { label: "Créer un événement", url: `${env.PUBLIC_URL}/orga/${s.slug}` },
          )
        : renderMail(
            `Vérification de ${s.name} : à compléter`,
            [
              "L'équipe Orasso n'a pas pu valider ta structure pour le moment.",
              note ? `Motif : ${note}` : "Vérifie tes justificatifs et renvoie-les.",
            ],
            { label: "Reprendre la vérification", url },
          ),
      { structureId, verified },
    );
  },
};
