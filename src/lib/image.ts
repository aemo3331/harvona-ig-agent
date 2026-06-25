import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

/**
 * Image generation via Gemini's native image model.
 *
 * Gemini returns image bytes inline (typically PNG); the Instagram Graph API only
 * accepts JPEG for feed posts, so we convert with sharp before returning.
 *
 * Model is configurable via GEMINI_IMAGE_MODEL. The default native image model is
 * available without a separate provider. (Imagen models give finer control but
 * require a billing-enabled tier — swap the model id and use `generateImages` if
 * you go that route.)
 */
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const b64 = imagePart?.inlineData?.data;
  if (!b64) {
    throw new Error(
      `No image returned by ${IMAGE_MODEL}. Confirm the model supports image output on your tier ` +
        `(set GEMINI_IMAGE_MODEL to a different image model if needed).`,
    );
  }

  // Convert whatever Gemini returned (usually PNG) to JPEG for Instagram.
  return await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 90 }).toBuffer();
}
