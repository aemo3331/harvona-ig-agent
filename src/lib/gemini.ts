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
  /** Short punchy line (3-7 words) rendered on the branded image card. */
  headline: string;
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
    `Produce exactly one post. The "headline" is a short, punchy hook of 3-7 words for a graphic card — no hashtags, no emoji, Title Case.`,
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
        },
        required: ["caption", "hashtags", "headline"],
        propertyOrdering: ["caption", "hashtags", "headline"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned no text content.");

  const data = JSON.parse(text) as {
    caption: string;
    hashtags: string[];
    headline: string;
  };

  return {
    caption: data.caption.trim(),
    hashtags: (data.hashtags ?? []).map((h) => h.replace(/^#/, "").trim()).filter(Boolean),
    headline: data.headline.trim(),
  };
}
