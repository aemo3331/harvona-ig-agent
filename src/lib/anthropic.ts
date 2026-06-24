import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

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
  imagePrompt: string;
}

/**
 * Generates one Instagram post (caption + hashtags + an image prompt) with Claude.
 * Uses structured outputs so we always get valid, parseable JSON back.
 */
export async function generatePost(brief: ContentBrief): Promise<GeneratedPost> {
  const system = [
    `You are the social media content lead for ${brief.brand}, an Instagram brand account.`,
    `About the company: ${brief.about}`,
    `Brand voice: ${brief.voice}`,
    `Guidelines: ${brief.guidelines}`,
    `Image style: ${brief.imageStyle}`,
    `Produce exactly one post. The image_prompt must describe a single still image with NO text, words, or logos rendered in it.`,
  ].join("\n\n");

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: `Create one Instagram post for this topic:\n\n"${brief.topic}"`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            caption: {
              type: "string",
              description: "The post caption, following the brand voice and guidelines.",
            },
            hashtags: {
              type: "array",
              items: { type: "string" },
              description: "5-12 relevant hashtags, lowercase, no leading '#' and no spaces.",
            },
            image_prompt: {
              type: "string",
              description: "A detailed prompt for an image model. No text/words/logos in the image.",
            },
          },
          required: ["caption", "hashtags", "image_prompt"],
          additionalProperties: false,
        },
      },
    },
  });

  // With structured outputs, the first text block contains the JSON.
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`No text content returned (stop_reason: ${response.stop_reason})`);
  }

  const data = JSON.parse(text.text) as {
    caption: string;
    hashtags: string[];
    image_prompt: string;
  };

  return {
    caption: data.caption.trim(),
    hashtags: data.hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean),
    imagePrompt: data.image_prompt.trim(),
  };
}
