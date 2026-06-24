/**
 * Image generation. Default implementation: OpenAI `gpt-image-1`, returning a JPEG.
 *
 * Why JPEG: the Instagram Graph API only accepts JPEG for feed image posts, so we
 * ask the provider for JPEG directly and avoid a conversion step.
 *
 * To swap providers (Google Imagen, Flux via Replicate/fal, Stability, etc.),
 * replace the body of generateImage() — keep the signature `(prompt) => Promise<Buffer>`.
 */
export async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set (needed by the default image provider).");
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      output_format: "jpeg",
      n: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { data: { b64_json: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image provider returned no image data.");

  return Buffer.from(b64, "base64");
}
