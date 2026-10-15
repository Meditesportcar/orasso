import { readThemeCookie, serverTheme, ThemeProvider, ThemeScript } from "@orasso/design-system/web";
import "@orasso/design-system/web/styles.css";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
];

// La préférence de thème est un cookie : le serveur écrit le bon `data-theme` dans le HTML, sans flash.
export function loader({ request }: Route.LoaderArgs) {
  return { themePreference: readThemeCookie(request.headers.get("cookie")) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const preference = data?.themePreference ?? "beton";
  return (
    // suppressHydrationWarning : pour « auto », ThemeScript corrige data-theme avant la première peinture.
    <html lang="fr" data-theme={serverTheme(preference)} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#17191C" />
        <ThemeScript />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider initialPreference={preference}>{children}</ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Erreur";
  let details = "Une erreur inattendue est survenue.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Erreur";
    details = error.status === 404 ? "Cette page n'existe pas." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
