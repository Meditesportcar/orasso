// Markdown réduit de la newsletter (lot 33) : titres, paragraphes, listes, gras, italique, liens http(s) et mailto.
// Tout le texte est échappé AVANT la mise en forme : aucun HTML saisi ne passe, aucun lien `javascript:`. Le même rendu
// sert à l'aperçu de `/admin/newsletter` et à l'e-mail envoyé (fonction pure, sans dépendance).

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function inline(text: string): string {
  let out = escapeHtml(text);
  // Liens : [libellé](https://…) ou (mailto:…) seulement ; l'adresse est déjà échappée.
  out = out.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[\s(])_([^_\s][^_]*)_/g, "$1<em>$2</em>");
  return out;
}

type Block = { kind: "h1" | "h2" | "h3" | "p" | "ul"; lines: string[] };

function blocks(md: string): Block[] {
  const out: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) out.push(current);
    current = null;
  };
  for (const raw of md.replaceAll("\r\n", "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push({ kind: `h${heading[1]?.length ?? 1}` as Block["kind"], lines: [heading[2] ?? ""] });
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (current?.kind !== "ul") {
        flush();
        current = { kind: "ul", lines: [] };
      }
      current.lines.push(item[1] ?? "");
      continue;
    }
    if (current?.kind !== "p") {
      flush();
      current = { kind: "p", lines: [] };
    }
    current.lines.push(line.trim());
  }
  flush();
  return out;
}

/** HTML sûr d'un texte Markdown réduit. */
export function markdownToHtml(md: string): string {
  return blocks(md)
    .map((b) => {
      if (b.kind === "ul") return `<ul>${b.lines.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`;
      if (b.kind === "p") return `<p>${b.lines.map(inline).join("<br>")}</p>`;
      return `<${b.kind}>${inline(b.lines[0] ?? "")}</${b.kind}>`;
    })
    .join("\n");
}

/** Version texte (e-mail en texte brut) : marques retirées, liens écrits « libellé (adresse) ». */
export function markdownToText(md: string): string {
  return blocks(md)
    .map((b) => {
      const plain = (l: string) =>
        l
          .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, "$1 ($2)")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/(^|[\s(])[*_]([^*_\s][^*_]*)[*_]/g, "$1$2");
      if (b.kind === "ul") return b.lines.map((l) => `- ${plain(l)}`).join("\n");
      return b.lines.map(plain).join("\n");
    })
    .join("\n\n");
}
