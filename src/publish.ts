import { readdir, readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { publishImage, buildRawImageUrl } from "./lib/instagram.js";

const QUEUE_DIR = "queue";
const PUBLISHED_DIR = "published";
const BRANCH = process.env.PUBLISH_BRANCH || "main";

interface PostJson {
  id: string;
  caption: string;
  hashtags: string[];
}

async function listQueueItems(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(QUEUE_DIR);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = join(QUEUE_DIR, name);
    if ((await stat(full)).isDirectory()) dirs.push(name);
  }
  return dirs;
}

function buildCaption(post: PostJson): string {
  const tags = post.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  return tags ? `${post.caption}\n\n${tags}` : post.caption;
}

async function main() {
  const igUserId = process.env.IG_USER_ID;
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!igUserId || !accessToken) {
    throw new Error("IG_USER_ID and IG_ACCESS_TOKEN must be set.");
  }
  if (!repo) {
    throw new Error("GITHUB_REPOSITORY (owner/repo) must be set to build the public image URL.");
  }

  const items = await listQueueItems();
  if (items.length === 0) {
    console.log("Nothing in the queue to publish.");
    return;
  }

  await mkdir(PUBLISHED_DIR, { recursive: true });

  for (const id of items) {
    const dir = join(QUEUE_DIR, id);
    const post: PostJson = JSON.parse(await readFile(join(dir, "post.json"), "utf8"));
    const imageUrl = buildRawImageUrl(repo, BRANCH, `${dir.replace(/\\/g, "/")}/image.jpg`);

    console.log(`Publishing ${id} ...`);
    console.log(`  image: ${imageUrl}`);

    const mediaId = await publishImage({
      igUserId,
      accessToken,
      imageUrl,
      caption: buildCaption(post),
    });

    console.log(`  published, media id: ${mediaId}`);

    // Move the item out of the queue and record the result.
    const dest = join(PUBLISHED_DIR, id);
    await rename(dir, dest);
    await writeFile(
      join(dest, "result.json"),
      JSON.stringify({ id, mediaId, publishedAt: new Date().toISOString() }, null, 2) + "\n",
    );
  }

  console.log(`\nDone. Published ${items.length} post(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
