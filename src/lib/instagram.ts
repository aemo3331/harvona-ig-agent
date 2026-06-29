/**
 * Instagram Graph API publishing.
 *
 * Two-step flow per the official docs:
 *   1. POST /{ig-user-id}/media          -> creates a media container (returns creation id)
 *   2. POST /{ig-user-id}/media_publish  -> publishes the container (returns media id)
 *
 * The image must be reachable at a PUBLIC https URL (`image_url`). We host the
 * committed image via raw.githubusercontent.com — see buildRawImageUrl().
 */

// Defaults to the "Instagram API with Facebook Login" host (token starts with EAA…).
// Override via env (IG_GRAPH_HOST=graph.instagram.com) for the Instagram-Login path.
const GRAPH_HOST = process.env.IG_GRAPH_HOST || "graph.facebook.com";
const GRAPH_VERSION = process.env.IG_GRAPH_VERSION || "v21.0";
const GRAPH = `https://${GRAPH_HOST}/${GRAPH_VERSION}`;

export interface PublishOptions {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}

export async function publishImage(opts: PublishOptions): Promise<string> {
  // 1. Create the media container.
  const createRes = await fetch(`${GRAPH}/${opts.igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: opts.imageUrl,
      caption: opts.caption,
      access_token: opts.accessToken,
    }),
  });
  const createBody = (await createRes.json()) as { id?: string; error?: unknown };
  if (!createRes.ok || !createBody.id) {
    throw new Error(`media container failed (${createRes.status}): ${JSON.stringify(createBody)}`);
  }
  const creationId = createBody.id;

  // 2. Publish the container.
  const pubRes = await fetch(`${GRAPH}/${opts.igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: opts.accessToken,
    }),
  });
  const pubBody = (await pubRes.json()) as { id?: string; error?: unknown };
  if (!pubRes.ok || !pubBody.id) {
    throw new Error(`media_publish failed (${pubRes.status}): ${JSON.stringify(pubBody)}`);
  }

  return pubBody.id;
}

/**
 * Builds the public raw URL for a file committed to the default branch.
 * Requires the repository (or at least these image files) to be PUBLIC.
 * `repo` is "owner/repo" (GitHub Actions provides this as GITHUB_REPOSITORY).
 */
export function buildRawImageUrl(repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
}
