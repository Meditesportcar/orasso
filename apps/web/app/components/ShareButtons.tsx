import { Button } from "@orasso/design-system/web";
import { useState } from "react";

/** Partager la page : copier le lien, WhatsApp, Instagram (le lien se colle dans une story). */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function copy(note: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(note);
    } catch {
      setMessage(url);
    }
  }

  return (
    <div className="s-stack s-stack--tight">
      <div className="ev__share">
        <Button variant="secondary" icon="share" onClick={() => copy("Lien copié.")}>
          Copier
        </Button>
        <Button
          variant="secondary"
          icon="chat"
          href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </Button>
        <Button variant="secondary" icon="instagram" onClick={() => copy("Lien copié : colle-le dans ta story.")}>
          Instagram
        </Button>
      </div>
      <p className="o-t-caption s-muted" role="status">
        {message ?? url}
      </p>
    </div>
  );
}
