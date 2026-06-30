import sharp from "sharp";

/**
 * Produces the JPEG for a post (Instagram requires JPEG).
 *
 * - If OPENAI_API_KEY is set and a prompt is provided → generate a real image with
 *   OpenAI `gpt-image-1`.
 * - Otherwise, or if the OpenAI call fails → render a free, local branded card with sharp.
 *
 * This keeps the pipeline robust: no key (or a transient OpenAI error) degrades gracefully
 * to the branded card instead of failing the whole run.
 */

const SIZE = 1080;
const MARGIN = 96;
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

export interface ImageRequest {
  brand: string;
  headline: string;
  handle?: string;
  /** Prompt for AI image generation (used when OPENAI_API_KEY is set). */
  prompt?: string;
  /** Brand style guidance appended to the AI prompt. */
  imageStyle?: string;
}

export async function generateImage(req: ImageRequest): Promise<Buffer> {
  if (process.env.OPENAI_API_KEY && req.prompt) {
    try {
      const fullPrompt = req.imageStyle ? `${req.prompt}\n\nStyle: ${req.imageStyle}` : req.prompt;
      const img = await generateOpenAiImage(fullPrompt);
      console.log(`Image: generated with OpenAI ${IMAGE_MODEL}.`);
      return img;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Image: OpenAI generation failed, falling back to branded card. ${msg}`);
    }
  } else {
    console.log("Image: OPENAI_API_KEY not set — using the local branded card.");
  }
  return renderBrandCard(req);
}

/** OpenAI gpt-image-1. Returns a JPEG buffer. */
async function generateOpenAiImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY as string;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      output_format: "jpeg",
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  // Re-encode as JPEG defensively (gpt-image-1 already returns JPEG when asked).
  return await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 90 }).toBuffer();
}

// --------------------------------------------------------------------------
// Free fallback: a clean, on-brand image card rendered locally (SVG -> JPEG).
// --------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

async function renderBrandCard(opts: ImageRequest): Promise<Buffer> {
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

  return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
