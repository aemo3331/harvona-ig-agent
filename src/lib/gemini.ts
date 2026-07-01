import { GoogleGenAI, Type } from "@google/genai";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  return new GoogleGenAI({ apiKey });
}

export interface ContentBrief {
  brand: string;
  about: string;
  voice: string;
  guidelines: string;
  topic: string;
  imageStyle: string;
}

export interface GeneratedPost {
  caption: string;
  hashtags: string[];
  /** Short punchy line (3-7 words) — used on the local branded-card fallback. */
  headline: string;
  /** Prompt for the AI image generator (OpenAI). No text/words/logos in the image. */
  imagePrompt: string;
}

/**
 * Generates one Instagram post (caption + hashtags + a short headline) with Gemini.
 * Uses structured output (responseSchema) so we always get valid, parseable JSON.
 */
export async function generatePost(brief: ContentBrief): Promise<GeneratedPost> {
  const system = [
    `You are the social media content lead for ${brief.brand}, an Instagram brand account.`,
    `About the company: ${brief.about}`,
    `Brand voice: ${brief.voice}`,
    `Guidelines: ${brief.guidelines}`,
    `Image style: ${brief.imageStyle}`,
    `Produce exactly one post. "headline" is a short, punchy hook of 3-7 words (no hashtags, no emoji, Title Case). "image_prompt" describes a single still image that MUST show real people interacting in a concrete digital-marketing scenario tied to the topic (e.g. a founder and a teammate reviewing marketing results on a laptop, planning content, or filming a post) — genuine human faces and collaboration, never abstract or faceless figures. Follow the image style. Render NO text, words, letters, numbers, or logos anywhere in the image.`,
  ].join("\n\n");

  const response = await getClient().models.generateContent({
    model: TEXT_MODEL,
    contents: `Create one Instagram post for this topic:\n\n"${brief.topic}"`,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          caption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          headline: { type: Type.STRING },
          image_prompt: { type: Type.STRING },
        },
        required: ["caption", "hashtags", "headline", "image_prompt"],
        propertyOrdering: ["caption", "hashtags", "headline", "image_prompt"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned no text content.");

  const data = JSON.parse(text) as {
    caption: string;
    hashtags: string[];
    headline: string;
    image_prompt: string;
  };

  return {
    caption: data.caption.trim(),
    hashtags: (data.hashtags ?? []).map((h) => h.replace(/^#/, "").trim()).filter(Boolean),
    headline: data.headline.trim(),
    imagePrompt: data.image_prompt.trim(),
  };
}
