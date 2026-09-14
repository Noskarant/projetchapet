const BLOCK_BREAK = /<\/(?:p|div|li|h[1-6]|section|article|header|footer)>/gi;
const OPEN_BLOCK = /<(?:p|div|li|h[1-6]|section|article|header|footer)\b[^>]*>/gi;
const BREAK = /<br\s*\/?\s*>/gi;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function documentEmailTextFromHtml(input: string) {
  const withoutNonText = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(BREAK, "\n")
    .replace(BLOCK_BREAK, "\n")
    .replace(OPEN_BLOCK, "\n")
    .replace(/<[^>]+>/g, "");

  const decoded = decodeHtmlEntities(withoutNonText).replace(/\r\n?/g, "\n");
  const result: string[] = [];
  let lastNonEmpty = "";

  for (const rawLine of decoded.split("\n")) {
    const line = rawLine.replace(/[\t ]+/g, " ").trim();
    if (/^Envoyé\s+(?:via|depuis)\s+(?:FORGEO|MANUFEO)\.?$/i.test(line)) continue;

    if (!line) {
      if (result.length && result[result.length - 1] !== "") result.push("");
      continue;
    }

    if (line.localeCompare(lastNonEmpty, "fr", { sensitivity: "base" }) === 0) continue;
    result.push(line);
    lastNonEmpty = line;
  }

  while (result[0] === "") result.shift();
  while (result[result.length - 1] === "") result.pop();
  return result.join("\n").trim();
}

export function buildClassicDocumentEmail(inputHtml: string) {
  const text = documentEmailTextFromHtml(inputHtml) || "Veuillez trouver votre document en pièce jointe.";
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split("\n").map((line) => escapeHtml(line)).join("<br>"))
    .filter(Boolean);

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55"><div style="max-width:640px;margin:0;padding:20px 16px">${paragraphs.map((paragraph) => `<p style="margin:0 0 16px">${paragraph}</p>`).join("")}</div></body></html>`;
  return { html, text };
}
