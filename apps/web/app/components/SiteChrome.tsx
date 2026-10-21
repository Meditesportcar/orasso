import {
  Button,
  Chip,
  FranceMapCredit,
  Logo,
  Monogram,
  type ThemePreference,
  useTheme,
} from "@orasso/design-system/web";
import { siteLabels as L } from "@orasso/shared";
import type { ReactNode } from "react";
import { useLocation } from "react-router";

const THEME_CHOICES: { id: ThemePreference; label: string }[] = [
  { id: "beton", label: "Béton" },
  { id: "sable", label: "Sable" },
  { id: "auto", label: "Automatique" },
];

/**
 * Choix du thème (DA v2, lot 38 : jamais imposé) : Béton, Sable ou Automatique (le soleil au centre du département de
 * l'utilisateur), mémorisé dans le cookie lu par le serveur.
 */
export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <fieldset className="s-theme">
      <legend className="o-visually-hidden">Thème</legend>
      {THEME_CHOICES.map((choice) => (
        <Chip key={choice.id} selected={preference === choice.id} onClick={() => setPreference(choice.id)}>
          {choice.label}
        </Chip>
      ))}
      <span className="s-theme__hint o-t-caption">Sable le jour, Béton après le coucher du soleil</span>
    </fieldset>
  );
}

/** Les quatre entrées de la navigation du site (lot 56, prototype `s-web-*`). */
const NAV = [
  { href: "/", label: L.nav.home },
  { href: "/evenements", label: L.nav.events },
  { href: "/organisateurs", label: L.nav.organizers },
  { href: "/professionnels", label: L.nav.pros },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * En-tête du site (lot 56) : logotype, Accueil · Événements · Organisateurs · Professionnels (l'entrée courante est
 * soulignée d'une barre moutarde en biais), puis les liens du compte (`children`) et « Télécharger l'appli » (`download`,
 * seulement sur les pages publiques ; en secondaire, le bouton principal de l'écran étant celui de la page).
 */
export function SiteHeader({ children, download = false }: { children?: ReactNode; download?: boolean }) {
  const { pathname } = useLocation();
  return (
    <header className="s-bar s-header w-head" data-bar>
      <a className="s-header__brand" href="/" aria-label="Orasso, accueil">
        <Logo width={128} />
      </a>
      <nav className="w-nav o-t-button" aria-label="Site">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
      <nav className="s-nav w-account o-t-button" aria-label="Compte">
        {children}
        {download && (
          <Button variant="secondary" icon="export" className="w-small" href="/appli">
            {L.download}
          </Button>
        )}
      </nav>
    </header>
  );
}

export const LEGAL_PAGES = [
  { slug: "conditions", label: "Conditions" },
  { slug: "confidentialite", label: "Confidentialité" },
  { slug: "mentions-legales", label: "Mentions légales" },
  { slug: "contact", label: "Contact" },
] as const;

/** Crédits des données affichées par le site : à garder identiques dans le pied et dans `/mentions-legales`. */
export function DataCredits({ className }: { className?: string }) {
  return (
    <p className={`w-credits o-t-credit${className ? ` ${className}` : ""}`} data-testid="data-credits">
      {L.credits.map.before}{" "}
      <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
        OpenFreeMap
      </a>
      ,{" "}
      <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">
        OpenMapTiles
      </a>{" "}
      {L.credits.map.and}{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        {L.credits.map.osm}
      </a>
      . <FranceMapCredit className="w-credits__inline" />{" "}
      <span>
        {L.credits.weather.before}{" "}
        <a href="https://open-meteo.com" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        .
      </span>
    </p>
  );
}

/**
 * Pied du site (lot 56) : la phrase de la plateforme, « Propulsé par Orasso », trois colonnes (Découvrir, Organiser,
 * Orasso), le choix du thème et les crédits des données.
 */
export function SiteFooter() {
  return (
    <footer className="s-bar s-footer w-foot" data-bar>
      <div className="w-foot__grid">
        <div className="w-foot__brand">
          <Logo width={128} />
          <p className="w-foot__phrase">{L.footer.phrase}</p>
          <span className="w-foot__powered o-t-label">
            <Monogram size={22} />
            {L.footer.powered}
          </span>
        </div>
        <div className="w-foot__col">
          <b className="o-t-label">{L.footer.discover}</b>
          <a href="/evenements">{L.nav.events}</a>
          <a href="/professionnels">{L.nav.pros}</a>
          <a href="/organisateurs">{L.footer.structures}</a>
        </div>
        <div className="w-foot__col">
          <b className="o-t-label">{L.footer.organize}</b>
          <a href="/organisateurs">{L.footer.organizerSpace}</a>
          <a href="/app/structure/nouvelle">{L.footer.createStructure}</a>
        </div>
        <div className="w-foot__col">
          <b className="o-t-label">{L.footer.orasso}</b>
          {LEGAL_PAGES.map((page) => (
            <a key={page.slug} href={`/${page.slug}`}>
              {page.slug === "conditions" ? L.footer.terms : page.label}
            </a>
          ))}
        </div>
      </div>
      <div className="w-foot__base">
        <DataCredits />
        <ThemeSwitch />
      </div>
    </footer>
  );
}
