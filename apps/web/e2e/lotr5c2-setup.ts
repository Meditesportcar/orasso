import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { addVehicleApi, apiCall, type Cookie, randomPlate, signUpApi } from "./helpers";

// Lot R5c2 : un crew complet créé par l'API, comme le ferait l'appli, pour les recettes de la page du crew (appli et
// site). Comptes neufs à chaque passage : le chef, une membre, une personne du dehors amie de la membre, un chercheur
// de crew et une personne qui a déjà demandé avec un message. Bannière : une photo d'essai du seed, plaque confirmée
// absente (chaîne des photos de véhicule).
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");

export type R5Account = { pseudo: string; email: string; cookie: Cookie; id: string };
export type R5Crew = {
  id: string;
  slug: string;
  name: string;
  chef: R5Account;
  lea: R5Account;
  sarah: R5Account;
  paul: R5Account;
  nina: R5Account;
};

async function account(pseudo: string): Promise<R5Account> {
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  return { pseudo, email, cookie, id: me.data.user.id };
}

/** Une photo d'essai du seed (jamais d'ailleurs). */
export function seedPhoto(name: string): Blob {
  return new Blob([new Uint8Array(readFileSync(`${PHOTOS}/${name}`))], { type: "image/jpeg" });
}

/** Le jour (« AAAA-MM-JJ », heure de Paris) dans `days` jours. */
export function parisDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

export async function r5Crew(tag: string): Promise<R5Crew> {
  const s = tag.slice(-6);
  const [chef, lea, sarah, paul, nina] = await Promise.all(
    ["Chef", "Lea", "Sarah", "Paul", "Nina"].map((p) => account(`R5${p}_${s}`)),
  );
  if (!chef || !lea || !sarah || !paul || !nina) throw new Error("Comptes de recette");
  for (const a of [chef, lea]) await addVehicleApi(a.cookie, randomPlate());
  const name = `Drift ${s}`;
  const created = await apiCall<{ id: string; slug: string }>(chef.cookie, "POST", "/crews", {
    name,
    description: "Glisse, japonaises et sorties du dimanche entre Perpignan et la côte.",
    department: "66",
  });
  expect(created.status).toBe(201);
  const crew = created.data;
  expect(
    (await apiCall(lea.cookie, "POST", `/crews/${crew.id}/requests`, { message: "Je roule en MX-5, je peux venir ?" }))
      .status,
  ).toBe(201);
  expect((await apiCall(chef.cookie, "POST", `/crews/${crew.id}/requests/${lea.id}/accept`)).status).toBe(204);
  expect((await apiCall(chef.cookie, "PATCH", `/crews/${crew.id}`, { instagram: "@roussillondrift" })).status).toBe(
    200,
  );
  // Sarah est amie de Léa : « 1 de tes amis en fait partie ».
  const friend = await apiCall<{ id: string }>(sarah.cookie, "POST", "/friends/requests", { pseudo: lea.pseudo });
  expect(friend.status).toBe(201);
  expect((await apiCall(lea.cookie, "POST", `/friends/requests/${friend.data.id}/accept`)).status).toBe(200);
  // Nina a déjà demandé, avec un message (Demandes du chef).
  expect(
    (
      await apiCall(nina.cookie, "POST", `/crews/${crew.id}/requests`, {
        message: "Je roule en S13, souvent à Canet le dimanche. Je peux venir à la prochaine balade ?",
      })
    ).status,
  ).toBe(201);
  // Bannière : photo du seed, aucune plaque visible confirmé (elle se voit aussi hors du crew).
  const form = new FormData();
  form.set("banner", seedPhoto("car-gtr.jpg"), "banniere.jpg");
  form.set("noPlate", "true");
  const banner = await fetch(`${API}/api/crews/${crew.id}/banner`, {
    method: "POST",
    headers: { origin: WEB, cookie: chef.cookie },
    body: form,
  });
  expect(banner.status).toBe(200);
  return { ...crew, name, chef, lea, sarah, paul, nina };
}

/** Une sortie proposée par l'API (pour les vues qui n'en créent pas). */
export async function r5Outing(crew: R5Crew, by: R5Account, title: string, days = 6) {
  const [y, m, d] = parisDay(days).split("-").map(Number) as [number, number, number];
  // 9 h à Paris : 7 ou 8 h UTC selon la saison ; l'API ne demande qu'une date à venir.
  const startsAt = new Date(Date.UTC(y, m - 1, d, 8, 0)).toISOString();
  const res = await apiCall<{ id: string }>(by.cookie, "POST", `/crews/${crew.id}/outings`, {
    title,
    startsAt,
    place: "Parking de la cave coopérative, Thuir",
    lat: 42.632,
    lng: 2.756,
    program: "Café à Thuir, puis la route de Castelnou et Prades. Retour vers 13 h.",
  });
  expect(res.status).toBe(201);
  return res.data.id;
}
