// Lot R5b (maquette R5.5 « Mes réseaux ») : les réseaux d'un passionné. On garde un pseudo, jamais une adresse : Orasso
// fabrique le lien (`socialUrl`), aucun lien piégé ne peut donc sortir d'un profil. Un lien de profil collé est ramené au
// pseudo ; un lien de publication ou d'un autre site est refusé avec une ligne qui dit quoi faire. Pur : l'API l'applique
// (`PATCH /me/profile`), l'appli et le site l'emploient pour répondre pendant la saisie.

export const socialNetworks = ["instagram", "tiktok", "youtube", "facebook", "snapchat"] as const;
export type SocialNetwork = (typeof socialNetworks)[number];

/** Les pseudos d'un profil, par réseau (absent = pas renseigné). */
export type ProfileSocials = Partial<Record<SocialNetwork, string>>;

/** Aucun pseudo ne dépasse 30 caractères (maquette R5.5) ; certains réseaux sont plus courts. */
export const SOCIAL_HANDLE_MAX = 30;

type NetworkRule = {
  label: string;
  /** Exemple montré dans le refus : « par exemple kenji.supra ». */
  example: string;
  /** Caractères permis et longueur (le réseau lui-même). */
  pattern: RegExp;
  allowed: string;
  min: number;
  max: number;
  hosts: readonly string[];
  /** Adresses courtes ou de lecture du réseau : toujours une publication (`youtu.be`, `vm.tiktok.com`…). */
  postHosts?: readonly string[];
  /** Préfixe affiché devant le champ (« @ », « / »). */
  prefix: string;
  /**
   * Pages du réseau à la place d'un pseudo dans l'adresse (`instagram.com/explore/`) : refusées dans un lien collé
   * comme dans un pseudo tapé (lot R5b, tour 2, relecture Codex 6). Seulement pour les réseaux dont l'adresse d'un
   * profil est le pseudo seul (Instagram, Facebook).
   */
  reserved?: readonly string[];
  /** Le pseudo dans le chemin d'un lien de profil ; `null` si le lien mène à une publication (ou n'est pas un profil). */
  profileFromPath: (segments: string[], search: URLSearchParams) => string | null;
  url: (handle: string) => string;
};

const single = (reserved: readonly string[]) => (segments: string[], _search?: URLSearchParams) => {
  const [first, ...rest] = segments;
  if (!first || rest.length > 0 || reserved.includes(first.toLowerCase())) return null;
  return first;
};

const INSTAGRAM_RESERVED = ["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "s"] as const;
const FACEBOOK_RESERVED = [
  "posts",
  "photo",
  "photo.php",
  "photos",
  "watch",
  "groups",
  "events",
  "share",
  "reel",
  "reels",
  "story.php",
  "permalink.php",
  "profile.php",
  "stories",
  "marketplace",
  "hashtag",
  "login",
  "people",
  "pages",
] as const;

const RULES: Record<SocialNetwork, NetworkRule> = {
  instagram: {
    label: "Instagram",
    example: "kenji.supra",
    pattern: /^[A-Za-z0-9._]+$/,
    allowed: "des lettres, des chiffres, « . » et « _ »",
    min: 1,
    max: 30,
    hosts: ["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"],
    prefix: "@",
    reserved: INSTAGRAM_RESERVED,
    profileFromPath: (segments, search) => {
      // Les onglets d'un profil (`/kenji.supra/reels/`) restent un lien de profil.
      const [first, second, ...rest] = segments;
      if (second && (rest.length > 0 || !["reels", "tagged", "guides"].includes(second))) return null;
      return single(INSTAGRAM_RESERVED)(first ? [first] : [], search);
    },
    url: (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`,
  },
  tiktok: {
    label: "TikTok",
    example: "kenji66.drift",
    pattern: /^[A-Za-z0-9._]+$/,
    allowed: "des lettres, des chiffres, « . » et « _ »",
    min: 2,
    max: 24,
    hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
    postHosts: ["vm.tiktok.com", "vt.tiktok.com"],
    prefix: "@",
    profileFromPath: (segments) => {
      const [first, ...rest] = segments;
      if (!first?.startsWith("@") || rest.length > 0) return null;
      return first.slice(1);
    },
    url: (h) => `https://www.tiktok.com/@${encodeURIComponent(h)}`,
  },
  youtube: {
    label: "YouTube",
    example: "kenji66",
    pattern: /^[A-Za-z0-9._-]+$/,
    allowed: "des lettres, des chiffres, « . », « _ » et « - »",
    min: 3,
    max: 30,
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com"],
    postHosts: ["youtu.be", "www.youtu.be"],
    prefix: "@",
    profileFromPath: (segments) => {
      const [first, ...rest] = segments;
      // Seule l'adresse en « @ » est un pseudo ; `/channel/UC…`, `/c/…` et `/user/…` ne se ramènent pas à lui.
      if (!first?.startsWith("@")) return null;
      if (rest.length > 1 || (rest[0] && !["videos", "shorts", "featured", "streams"].includes(rest[0]))) return null;
      return first.slice(1);
    },
    url: (h) => `https://www.youtube.com/@${encodeURIComponent(h)}`,
  },
  facebook: {
    label: "Facebook",
    example: "kenji.supra",
    pattern: /^[A-Za-z0-9.]+$/,
    allowed: "des lettres, des chiffres et « . »",
    min: 5,
    max: 30,
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com", "web.facebook.com"],
    postHosts: ["fb.watch", "fb.me"],
    prefix: "/",
    reserved: FACEBOOK_RESERVED,
    profileFromPath: (segments, search) => {
      // `profile.php?id=…` : l'identifiant chiffré du profil, qui sert de pseudo (facebook.com/<identifiant>).
      if (segments.length === 1 && segments[0] === "profile.php") {
        const id = search.get("id");
        return id && /^\d{5,30}$/.test(id) ? id : null;
      }
      return single(FACEBOOK_RESERVED)(segments);
    },
    url: (h) => `https://www.facebook.com/${encodeURIComponent(h)}`,
  },
  snapchat: {
    label: "Snapchat",
    example: "kenji66",
    pattern: /^[A-Za-z][A-Za-z0-9._-]*$/,
    allowed: "des lettres (en premier), des chiffres, « . », « _ » et « - »",
    min: 3,
    max: 15,
    hosts: ["snapchat.com", "www.snapchat.com"],
    postHosts: ["t.snapchat.com", "story.snapchat.com"],
    prefix: "@",
    profileFromPath: (segments) => {
      const [first, second, ...rest] = segments;
      if (first === "add" && second && rest.length === 0) return second;
      if (first?.startsWith("@") && !second) return first.slice(1);
      return null;
    },
    url: (h) => `https://www.snapchat.com/add/${encodeURIComponent(h)}`,
  },
};

/** Nom affiché du réseau (« Instagram »). */
export function socialLabel(network: SocialNetwork): string {
  return RULES[network].label;
}

/** Préfixe du champ de saisie : « @ » (ou « / » pour Facebook). */
export function socialPrefix(network: SocialNetwork): string {
  return RULES[network].prefix;
}

export type SocialHandleResult = { ok: true; handle: string | null } | { ok: false; reason: string };

function looksLikeLink(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^(www\.|m\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(value);
}

/**
 * Le pseudo propre d'une saisie, ou le refus avec la raison (une phrase qui dit quoi faire). Vide = pas de pseudo
 * (`handle: null`). Un « @ » en tête est retiré ; un lien de profil du réseau est ramené au pseudo ; un lien vers une
 * publication ou un autre site est refusé.
 */
export function socialHandle(network: SocialNetwork, input: string | null | undefined): SocialHandleResult {
  const rule = RULES[network];
  const value = (input ?? "").trim();
  if (!value) return { ok: true, handle: null };
  const fix = `Mets ton pseudo ${rule.label}, par exemple ${rule.example}.`;
  let handle = value;
  if (looksLikeLink(value)) {
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return { ok: false, reason: `Ce lien est illisible. ${fix}` };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:")
      return { ok: false, reason: `Ce lien est illisible. ${fix}` };
    const host = url.hostname.toLowerCase();
    if (rule.postHosts?.includes(host)) return { ok: false, reason: `Ce lien mène à une publication. ${fix}` };
    if (!rule.hosts.includes(host)) return { ok: false, reason: `Ce lien mène à un autre site. ${fix}` };
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponentSafe);
    const fromPath = segments.length ? rule.profileFromPath(segments, url.searchParams) : null;
    if (!fromPath) return { ok: false, reason: `Ce lien mène à une publication. ${fix}` };
    handle = fromPath;
  } else if (value.includes("/") || /\s/.test(value)) {
    return { ok: false, reason: `Un pseudo ${rule.label} n'a ni espace ni « / ». ${fix}` };
  }
  handle = handle.replace(/^@+/, "");
  if (!handle) return { ok: true, handle: null };
  if (handle.length > rule.max)
    return { ok: false, reason: `${rule.max} caractères au plus pour un pseudo ${rule.label}.` };
  if (!rule.pattern.test(handle)) {
    return { ok: false, reason: `Un pseudo ${rule.label} n'a que ${rule.allowed}. ${fix}` };
  }
  if (handle.length < rule.min) {
    return { ok: false, reason: `${rule.min} caractères au moins pour un pseudo ${rule.label}.` };
  }
  // Tour 2 (relecture Codex 6) : « . » et « .. » feraient `instagram.com/./` ou `/../`, que le navigateur ramène à
  // l'accueil du réseau ; un pseudo fait seulement de points n'en est pas un.
  if (/^\.+$/.test(handle)) return { ok: false, reason: `Un pseudo ${rule.label} n'est pas fait que de points. ${fix}` };
  // Une page du réseau tapée comme pseudo (« explore ») : le lien ne mènerait à aucun profil.
  if (rule.reserved?.includes(handle.toLowerCase())) {
    const of = /^[aeiouy]/i.test(rule.label) ? `d'${rule.label}` : `de ${rule.label}`;
    return { ok: false, reason: `« ${handle} » est une page ${of}, pas un pseudo. ${fix}` };
  }
  return { ok: true, handle };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Adresse du profil, fabriquée par Orasso à partir d'un pseudo déjà validé (`null` si le pseudo ne passe pas). */
export function socialUrl(network: SocialNetwork, handle: string | null | undefined): string | null {
  const checked = socialHandle(network, handle);
  if (!checked.ok || !checked.handle) return null;
  return RULES[network].url(checked.handle);
}

/** Les réseaux renseignés, dans l'ordre de la maquette (Instagram, TikTok, YouTube, Facebook, Snapchat). */
export function filledSocials(
  socials: ProfileSocials | null | undefined,
): { network: SocialNetwork; handle: string }[] {
  if (!socials) return [];
  return socialNetworks.flatMap((network) => {
    const handle = socials[network];
    return handle ? [{ network, handle }] : [];
  });
}
