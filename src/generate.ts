import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { generatePost, type ContentBrief } from "./lib/anthropic.js";
import { generateImage } from "./lib/image.js";

interface Config {
  brand: string;
  handle: string;
  about: string;
  voice: string;
  guidelines: string;
  topics: string[];
  imageStyle: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function stamp(): string {
  // e.g. 2026-06-25-1430
  return new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
}

async function main() {
  const config: Config = JSON.parse(await readFile("content.config.json", "utf8"));
  const topic = process.env.TOPIC?.trim() || pick(config.topics);

  const brief: ContentBrief = {
    brand: config.brand,
    about: config.about,
    voice: config.voice,
    guidelines: config.guidelines,
    topic,
    imageStyle: config.imageStyle,
  };

  console.log(`Generating a post about: ${topic}`);
  const post = await generatePost(brief);

  console.log("Generating the image...");
  const image = await generateImage(`${post.imagePrompt}\n\nStyle: ${config.imageStyle}`);

  const id = stamp();
  const dir = join("queue", id);
  await mkdir(dir, { recursive: true });

  await writeFile(join(dir, "image.jpg"), image);
  await writeFile(
    join(dir, "post.json"),
    JSON.stringify(
      {
        id,
        topic,
        caption: post.caption,
        hashtags: post.hashtags,
        imagePrompt: post.imagePrompt,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );

  // Human-readable preview that renders nicely in the PR diff.
  const hashtagLine = post.hashtags.map((h) => `#${h}`).join(" ");
  await writeFile(
    join(dir, "PREVIEW.md"),
    [
      `# Draft post — ${id}`,
      "",
      `**Topic:** ${topic}`,
      "",
      "![image](./image.jpg)",
      "",
      "## Caption",
      "",
      post.caption,
      "",
      hashtagLine,
      "",
      "---",
      "_Merge this PR to approve and publish. Close it to reject._",
      "",
    ].join("\n"),
  );

  console.log(`\nQueued: ${dir}`);
  console.log("Review the PR, then merge to publish.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
