/** Strip HTML and common email boilerplate for chat-style display. */

const SIGNATURE_MARKERS = [
  /^--\s*$/m,
  /^_{3,}$/m,
  /^sent from my /im,
  /^get outlook for/im,
  /^best regards?,?$/im,
  /^kind regards?,?$/im,
  /^thanks?,?$/im,
  /^cheers,?$/im,
];

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function stripEmailBody(input: {
  body?: string;
  bodyHtml?: string | null;
}): { plain: string; original: string } {
  const original =
    input.bodyHtml?.trim() ||
    input.body?.trim() ||
    "";

  let plain = input.body?.trim() || "";
  if (input.bodyHtml) {
    plain = htmlToPlainText(input.bodyHtml);
  }
  if (!plain && original) {
    plain = original;
  }

  for (const marker of SIGNATURE_MARKERS) {
    const match = plain.match(marker);
    if (match?.index != null && match.index > 40) {
      plain = plain.slice(0, match.index).trim();
      break;
    }
  }

  plain = plain
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*>+\s?/gm, "")
    .trim();

  return { plain, original };
}

export function extractSenderEmail(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  if (from.includes("@")) return from.trim().toLowerCase();
  return from.trim().toLowerCase();
}

export function displaySender(from: string): string {
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch?.[1]) return nameMatch[1].trim();
  return extractSenderEmail(from) || from;
}
