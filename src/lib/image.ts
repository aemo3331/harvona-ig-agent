import sharp from "sharp";

/**
 * Renders a simple, on-brand image card locally with sharp — no image API, no cost.
 * Produces a 1080x1080 JPEG (Instagram square). It's a clean placeholder/quote-card
 * you can publish as-is or swap for a custom visual before approving the PR.
 *
 * (Gemini's image model requires a paid tier; this keeps the pipeline free.)
 */

const SIZE = 1080;
const MARGIN = 96;

export interface BrandImageOptions {
  brand: string;
  headline: string;
  handle?: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word-wrap to a max characters-per-line, capped at maxLines. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

export async function generateImage(opts: BrandImageOptions): Promise<Buffer> {
  const fontSize = 66;
  const lineHeight = 88;
  const lines = wrap(opts.headline, 20, 5);
  const blockHeight = (lines.length - 1) * lineHeight;
  const startY = SIZE / 2 - blockHeight / 2 + fontSize / 3;

  const headlineSvg = lines
    .map(
      (ln, i) =>
        `<text x="${MARGIN}" y="${startY + i * lineHeight}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="#2B2620">${escapeXml(ln)}</text>`,
    )
    .join("\n  ");

  const handle = opts.handle ? `@${opts.handle.replace(/^@/, "")}` : "";

  const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFF6EC"/>
      <stop offset="100%" stop-color="#FCD9A8"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <circle cx="910" cy="170" r="240" fill="#F4A261" fill-opacity="0.18"/>
  <circle cx="990" cy="980" r="180" fill="#E76F51" fill-opacity="0.15"/>
  <rect x="${MARGIN}" y="148" width="64" height="6" rx="3" fill="#B5651D"/>
  <text x="${MARGIN}" y="124" font-family="sans-serif" font-size="30" font-weight="bold" letter-spacing="6" fill="#B5651D">${escapeXml(opts.brand.toUpperCase())}</text>
  ${headlineSvg}
  ${handle ? `<text x="${MARGIN}" y="${SIZE - 90}" font-family="sans-serif" font-size="30" fill="#7A5230">${escapeXml(handle)}</text>` : ""}
</svg>`;

  // Render the SVG and emit JPEG (Instagram requires JPEG for feed images).
  return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
