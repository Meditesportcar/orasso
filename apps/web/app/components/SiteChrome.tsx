import { Chip, Logo, PoweredBy, type ThemePreference, useTheme } from "@orasso/design-system/web";
import type { ReactNode } from "react";

const THEME_CHOICES: { id: ThemePreference; label: string }[] = [
  { id: "beton", label: "Béton" },
  { id: "sable", label: "Sable" },
  { id: "auto", label: "Auto" },
];

/** Choix du thème (Béton, Sable ou celui de l'appareil), mémorisé dans le cookie lu par le serveur. */
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
    </fieldset>
  );
}

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="s-bar s-header">
      <a className="s-header__brand" href="/" aria-label="Orasso, accueil">
        <Logo width={120} />
      </a>
      <nav className="s-nav o-t-button" aria-label="Compte">
        {children}
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

export function SiteFooter() {
  return (
    <footer className="s-bar s-footer o-t-meta">
      <PoweredBy />
      {LEGAL_PAGES.map((page) => (
        <a key={page.slug} href={`/${page.slug}`}>
          {page.label}
        </a>
      ))}
      <ThemeSwitch />
    </footer>
  );
}
