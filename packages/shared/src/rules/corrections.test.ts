// Lot 36 : règles partagées des corrections demandées par Damien (raison d'un blocage, mot de passe, assistant).
import { describe, expect, it } from "vitest";
import {
  eventAddressProblem,
  eventOpeningProblem,
  eventStepProblem,
  initialEventDraft,
  toWallInput,
  withCopyOpening,
  withShiftedStart,
} from "../eventWizard";
import { registrationBlockText } from "../labels/corrections.fr";
import { expressSignupSchema } from "../schemas/access";
import { eventCreateSchema, eventUpdateSchema } from "../schemas/event";
import { PASSWORD_MIN_LENGTH, passwordLengthProblem } from "./password";
import { type RegistrationBlockEvent, registrationBlock } from "./registrationBlock";

const H = 3_600_000;
const START = Date.parse("2026-11-08T09:00:00Z");
const event = (over: Partial<RegistrationBlockEvent> = {}): RegistrationBlockEvent => ({
  status: "published",
  startsAt: new Date(START).toISOString(),
  endsAt: new Date(START + 4 * H).toISOString(),
  lockAt: new Date(START - 2 * H).toISOString(),
  admission: "filtered",
  registrationsOpenAt: new Date(START - 72 * H).toISOString(),
  previewHours: 24,
  highGradePreviewHours: 0,
  ...over,
});
const when = (iso: string) => iso.slice(0, 16);

describe("raison d'un blocage des candidatures", () => {
  it("ouvert : aucune raison", () => {
    expect(registrationBlock(event(), START - 10 * H)).toBeNull();
  });

  it("verrouillage à H-2 : la raison dit quand et pourquoi", () => {
    const block = registrationBlock(event(), START - H);
    expect(block).toEqual({ code: "locked", at: new Date(START - 2 * H).toISOString(), offsetMinutes: 120 });
    expect(registrationBlockText(block!, when)).toMatch(/Inscriptions closes depuis le .* : 2 h avant le début/);
  });

  it("avant-première des abonnés en cours, puis pas encore ouvert pour personne", () => {
    const preview = registrationBlock(event(), START - 80 * H);
    expect(preview).toMatchObject({ code: "preview", highGrades: false });
    expect(registrationBlockText(preview!, when)).toMatch(/réservée aux abonnés/);
    expect(registrationBlock(event({ highGradePreviewHours: 48 }), START - 110 * H)).toMatchObject({
      code: "preview",
      highGrades: true,
    });
    expect(registrationBlock(event(), START - 200 * H)).toMatchObject({ code: "not_open" });
    // Abonné : son ouverture (avant-première comprise) est passée, il peut candidater.
    const forMe = new Date(START - 96 * H).toISOString();
    expect(registrationBlock(event({ registrationOpensAtForMe: forMe }), START - 80 * H)).toBeNull();
  });

  it("brouillon, annulé, terminé, sur invitation", () => {
    expect(registrationBlock(event({ status: "draft" }), START - 10 * H)?.code).toBe("draft");
    expect(registrationBlock(event({ status: "cancelled" }), START - 10 * H)?.code).toBe("cancelled");
    expect(registrationBlock(event(), START + 5 * H)?.code).toBe("ended");
    expect(registrationBlock(event({ admission: "invite_only" }), START - 10 * H)?.code).toBe("invite_only");
    expect(registrationBlockText({ code: "invite_only" }, when)).toMatch(/équipe organisatrice/);
  });
});

describe("mot de passe : une seule longueur minimale", () => {
  it("10 caractères partout", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(passwordLengthProblem("123456789")).toMatch(/10 caractères/);
    expect(passwordLengthProblem("1234567890")).toBeNull();
  });

  it("inscription express : longueur partagée et conditions générales obligatoires", () => {
    const base = {
      pseudo: "Paul_66",
      password: "motdepasse-1",
      firstName: "Paul",
      lastName: "N",
      unregistered: true,
      makeId: "11111111-1111-4111-8111-111111111111",
      modelId: "11111111-1111-4111-8111-111111111111",
    };
    expect(expressSignupSchema.safeParse(base).success).toBe(false);
    expect(expressSignupSchema.safeParse({ ...base, termsAccepted: true }).success).toBe(true);
    expect(expressSignupSchema.safeParse({ ...base, password: "court-12", termsAccepted: true }).success).toBe(false);
  });
});

describe("assistant d'événement", () => {
  const NOW = new Date("2026-10-18T14:50:00Z");
  const draft = () => ({
    ...initialEventDraft(NOW),
    title: "Rasso du port",
    startsAt: "2026-11-08T09:00",
    endsAt: "2026-11-08T13:00",
    addressLine: "Quai du port",
    city: "Port-Vendres",
  });

  it("adresse et ville obligatoires (étape Format du site, schéma de l'API)", () => {
    expect(eventAddressProblem(draft())).toBeNull();
    expect(eventAddressProblem({ ...draft(), addressLine: " " })).toMatch(/adresse/);
    expect(eventStepProblem("lieu", { ...draft(), city: "" })).toMatch(/ville/);
    const body = {
      title: "Rasso",
      format: "gathering",
      startsAt: "2026-11-08T09:00:00Z",
      endsAt: "2026-11-08T13:00:00Z",
      admittedVehicleTypes: ["car"],
      admission: "open",
      registrationsOpenAt: "2026-10-18T09:00:00Z",
    };
    expect(eventCreateSchema.safeParse(body).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...body, addressLine: "Quai", city: "Canet" }).success).toBe(true);
    expect(eventUpdateSchema.safeParse({ addressLine: "" }).success).toBe(false);
    expect(eventUpdateSchema.safeParse({ title: "Autre titre" }).success).toBe(true);
  });

  it("l'ouverture des candidatures précède le début", () => {
    expect(eventOpeningProblem(draft())).toBeNull();
    expect(eventOpeningProblem({ ...draft(), registrationsOpenAt: "2026-11-08T10:00" })).toMatch(/précéder/);
  });

  it("copie d'un événement : changer le début décale l'ouverture d'autant (lot 36, point 9)", () => {
    // Copie reprise à +52 semaines : ouverture le 16/10/2027 15:12 ; on la ramène au 8 novembre 2026.
    const copy = { ...draft(), startsAt: "2027-11-06T09:00", registrationsOpenAt: "2027-10-16T15:12" };
    const moved = withShiftedStart(copy, "2026-11-07T09:00");
    expect(moved.startsAt).toBe("2026-11-07T09:00");
    expect(moved.registrationsOpenAt).toBe("2026-10-17T15:12");
    expect(toWallInput(new Date("2026-10-17T13:12:00Z"))).toBe("2026-10-17T15:12");
  });

  it("copie passée à plusieurs jours : l'ouverture garde le délai de l'original, jamais avant maintenant", () => {
    const lead = 7 * 86_400_000;
    const multi = {
      ...draft(),
      multiDay: true,
      days: [
        { date: "2027-01-10", startTime: "09:00", endTime: "18:00", capacity: "" },
        { date: "2027-01-09", startTime: "09:00", endTime: "18:00", capacity: "" },
      ],
      registrationsOpenAt: "2027-10-16T15:12",
    };
    expect(withCopyOpening(multi, lead, NOW).registrationsOpenAt).toBe("2027-01-02T09:00");
    expect(withCopyOpening({ ...draft(), startsAt: "2026-10-20T09:00" }, lead, NOW).registrationsOpenAt).toBe(
      toWallInput(NOW),
    );
  });
});
