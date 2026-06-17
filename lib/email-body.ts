/**
 * Turn raw email (HTML or text) into a clean, readable plain-text view:
 * maximum readability, minimum noise. Decodes all HTML entities, strips the
 * invisible/zero-width padding bulk senders inject (e.g. &#8204;), removes
 * quoted reply history, signatures, and tracking footers, and collapses the
 * whitespace that padding leaves behind.
 *
 * The raw content is never mutated by this module — callers keep it verbatim
 * (body_original in the mirror) and use this only to derive the readable view.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  cent: "¢",
  copy: "©",
  deg: "°",
  divide: "÷",
  emsp: " ",
  ensp: " ",
  euro: "€",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  pound: "£",
  quot: '"',
  raquo: "»",
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  shy: "",
  thinsp: " ",
  times: "×",
  trade: "™",
  zwj: "",
  zwnj: "",
};

/** Decode named, decimal (&#8204;) and hex (&#x200c;) HTML entities. */
function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi,
    (match, raw: string) => {
      if (raw[0] === "#") {
        const isHex = raw[1] === "x" || raw[1] === "X";
        const code = isHex
          ? Number.parseInt(raw.slice(2), 16)
          : Number.parseInt(raw.slice(1), 10);
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try {
            return String.fromCodePoint(code);
          } catch {
            return "";
          }
        }
        return "";
      }
      const named = NAMED_ENTITIES[raw.toLowerCase()];
      return named === undefined ? match : named;
    },
  );
}

// Zero-width and bidi/format characters used as spam padding or that break
// readability. (Line/paragraph separators are normalised to \n separately.)
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x00ad, 0x00ad], // soft hyphen
  [0x200b, 0x200f], // zero-width space .. RLM
  [0x202a, 0x202e], // bidi embeddings / overrides
  [0x2060, 0x2064], // word joiner .. invisible plus
  [0x206a, 0x206f], // deprecated format chars
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
  [0xfff9, 0xfffb], // interlinear annotation
];
// Built at runtime from code points so this source file stays pure ASCII
// (no literal zero-width characters to silently corrupt the matcher).
const INVISIBLE_RE = new RegExp(
  `[${INVISIBLE_RANGES.map(([a, b]) =>
    a === b
      ? String.fromCodePoint(a)
      : `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`,
  ).join("")}]`,
  "g",
);
const LINE_SEP_RE = new RegExp(
  `[${String.fromCodePoint(0x2028)}${String.fromCodePoint(0x2029)}]`,
  "g",
);
const NBSP_RE = new RegExp(String.fromCodePoint(0x00a0), "g");

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(LINE_SEP_RE, "\n")
    .replace(NBSP_RE, " ")
    .replace(INVISIBLE_RE, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_m, inner: string) => inner)
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|table|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]+>/g, "");
}

export function htmlToPlainText(html: string): string {
  return decodeEntities(stripTags(html));
}

// Start of a quoted reply chain — everything from here down is history.
const QUOTE_MARKERS: RegExp[] = [
  /^\s*On\b.{0,200}\bwrote:\s*$/im,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*_{5,}\s*$/m,
  /^\s*From:.*$\n^\s*(Sent|Date):.*$/im,
  /^\s*>{1,}.*$/m,
];

function stripQuotedHistory(text: string): string {
  let cutAt = -1;
  for (const marker of QUOTE_MARKERS) {
    const match = text.match(marker);
    if (match?.index != null && (cutAt === -1 || match.index < cutAt)) {
      cutAt = match.index;
    }
  }
  if (cutAt > 0) {
    const head = text.slice(0, cutAt).trim();
    if (head.length > 0) {
      return head;
    }
  }
  return text;
}

const SIGNATURE_MARKERS: RegExp[] = [
  /^--\s*$/m,
  /^sent from my /im,
  /^get outlook for /im,
  /^best regards?,?\s*$/im,
  /^kind regards?,?\s*$/im,
  /^warm regards?,?\s*$/im,
  /^cheers,?\s*$/im,
];

function stripSignature(text: string): string {
  for (const marker of SIGNATURE_MARKERS) {
    const match = text.match(marker);
    if (match?.index != null && match.index > 40) {
      return text.slice(0, match.index).trim();
    }
  }
  return text;
}

// Conservative bulk-email footer removal — only cut well past the body start.
const FOOTER_MARKERS: RegExp[] = [
  /^.*\bunsubscribe\b.*$/im,
  /^.*view (this email |it )?in (your )?browser.*$/im,
  /^.*manage (your )?(email )?preferences.*$/im,
  /^.*no longer want to receive.*$/im,
];

function stripFooter(text: string): string {
  let cutAt = -1;
  for (const marker of FOOTER_MARKERS) {
    const match = text.match(marker);
    if (
      match?.index != null &&
      match.index > 80 &&
      (cutAt === -1 || match.index < cutAt)
    ) {
      cutAt = match.index;
    }
  }
  if (cutAt > 0) {
    const head = text.slice(0, cutAt).trim();
    if (head.length > 0) {
      return head;
    }
  }
  return text;
}

export function stripEmailBody(input: {
  body?: string;
  bodyHtml?: string | null;
}): { plain: string; original: string } {
  const original = input.bodyHtml?.trim() || input.body?.trim() || "";

  let plain: string;
  if (input.bodyHtml && /<[a-z][\s\S]*>/i.test(input.bodyHtml)) {
    plain = htmlToPlainText(input.bodyHtml);
  } else {
    plain = decodeEntities(input.body?.trim() || "");
  }
  if (!plain && original) {
    plain = htmlToPlainText(original);
  }

  plain = normalizeWhitespace(plain);
  plain = stripQuotedHistory(plain);
  plain = stripSignature(plain);
  plain = stripFooter(plain);
  plain = normalizeWhitespace(plain);

  return { plain, original };
}

/**
 * Re-derive the readable view from stored raw content (body_original), falling
 * back to an already-cleaned value. Lets the thread API apply the latest
 * cleaner to messages that were synced under an older version.
 */
export function readableEmailBody(
  raw: string | null | undefined,
  fallback?: string | null,
): string {
  const source = raw?.trim();
  if (!source) {
    return (fallback ?? "").trim();
  }
  const isHtml = /<[a-z][\s\S]*>/i.test(source);
  const { plain } = stripEmailBody(
    isHtml ? { bodyHtml: source } : { body: source },
  );
  return plain || (fallback ?? "").trim();
}

export function extractSenderEmail(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  if (angle?.[1]) {
    return angle[1].trim().toLowerCase();
  }
  if (from.includes("@")) {
    return from.trim().toLowerCase();
  }
  return from.trim().toLowerCase();
}

export function displaySender(from: string): string {
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch?.[1]) {
    return nameMatch[1].trim();
  }
  return extractSenderEmail(from) || from;
}
