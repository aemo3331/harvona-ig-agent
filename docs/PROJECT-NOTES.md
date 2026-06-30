# Harvona IG Agent — Project Notes, Maintenance & Enhancements

Reference doc for the `@harvona_international_ai` content agent. Covers how it was built,
the current config, how to **refresh the access token** (it expires), and how to **swap the
image step to OpenAI/ChatGPT or Canva**.

Repo: https://github.com/aemo3331/harvona-ig-agent (public) · default branch `main`.

---

## 1. What it does

```
 GENERATE (GitHub Actions, Mon/Wed/Fri 13:00 UTC, or on-demand)
   → Gemini writes caption + hashtags + a short headline
   → a branded image card is rendered locally (SVG → JPEG via sharp)
   → commits to /queue and opens a review Pull Request
 REVIEW  → you open the PR; MERGE = approve & publish, CLOSE = reject
 PUBLISH (on merge to main, or `gh workflow run publish.yml`)
   → Instagram Graph API: create media container → publish
   → moves the item from /queue to /published
```

You never touch code in normal use — you review PRs and merge the ones you like.

## 2. Current configuration

| Thing | Value |
|---|---|
| Caption model | Gemini `gemini-2.5-flash` (free tier) — `src/lib/gemini.ts` |
| Image | Local branded card (no API, free) — `src/lib/image.ts` |
| Publish API | `graph.facebook.com` (Facebook-Login path) — `src/lib/instagram.ts` |
| `IG_USER_ID` | `17841414155179209` (the IG business account id; public, not secret) |
| Instagram ↔ Page | `@harvona_international_ai` linked to FB Page **Harvona International** |
| CI runtime | **Node 22 + pnpm 11** (both required together) |
| Schedule | cron `0 13 * * 1,3,5` in `.github/workflows/generate.yml` |
| Brand/voice/topics | `content.config.json` |

**GitHub Actions secrets:** `GEMINI_API_KEY`, `IG_USER_ID`, `IG_ACCESS_TOKEN`.
Set any secret with: `gh secret set <NAME> --body '<value>'` (the interactive hidden prompt
repeatedly truncated values — always use `--body`).

**Workflows:**
- `generate.yml` — scheduled/dispatch; generates a draft and opens a PR.
- `publish.yml` — on push to `main` touching `queue/**`, or manual dispatch; publishes.
- `verify-ig.yml` — manual, **read-only**; confirms `IG_USER_ID`+`IG_ACCESS_TOKEN` resolve to the account *without* posting. Run it after any token change.

## 3. Key decisions & gotchas (so they aren't relearned)

- **Providers:** started on Claude (captions) + OpenAI `gpt-image-1` (images). Switched to **Gemini** because the `accenture.com` email is blocked from creating Anthropic/OpenAI console accounts (use a personal email for any dev-console signup). Gemini's **image** model has **0 free-tier quota** (needs billing), so images are rendered locally instead.
- **Gemini keys:** AI Studio now issues `AQ.`-prefixed "auth keys" (service-account bound) — there's no `AIza` option anymore. They work via the `x-goog-api-key` header (the `@google/genai` default). Google **Pro / Gemini Advanced** is a *consumer* sub and does **not** include API access — the API key is separate and free-tier.
- **CI:** pnpm 11 requires Node ≥ 22.13 (it uses `node:sqlite`). `pnpm-workspace.yaml` holds the build-script allow-list, which pnpm 9 rejects ("packages field missing"). So CI pins Node 22 + pnpm 11.
- **Instagram API path:** two options exist — *Instagram Login* (`graph.instagram.com`, `IGAA…` tokens) and *Facebook Login* (`graph.facebook.com`, `EAA…` tokens). We use **Facebook Login** (only `EAA…` tokens were obtainable). The host is configurable via the `IG_GRAPH_HOST` env var if you ever switch.
- **Publishing requires** the IG account to be **Business/Creator** and **linked to a Facebook Page** (done in Meta Business Suite → *Accounts → Instagram accounts → Connected assets*). Without the link, `me/accounts` returns the Page but no `instagram_business_account`.
- **Image hosting:** the Graph API needs a public image URL; we use `raw.githubusercontent.com` on this public repo. If the repo is ever made private, switch to a media host (Vercel Blob / S3 / Cloudinary) in `instagram.ts`.
- **Secrets:** never paste real keys into `.env.example` (it's committed). GitHub push protection will (correctly) block it.

## 4. Maintenance — refreshing `IG_ACCESS_TOKEN`

**The current token expires `2026-08-29`** (it's a ~60-day token, not permanent). Two paths:

### Option A (recommended, one-time) — switch to a PERMANENT Page token
A Facebook **Page** access token derived from a **long-lived user token never expires**. Do this once and you stop refreshing.

1. **Graph API Explorer** (host `graph.facebook.com`, app *Harvona*): add permissions `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management` → **Generate Access Token** (User) → approve, selecting the Page + IG account.
2. **Extend to long-lived** (60d):
   ```
   curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_LIVED"
   ```
   (`APP_ID`/`APP_SECRET` from App settings → Basic.)
3. **Get the permanent Page token** using the long-lived user token:
   ```
   curl "https://graph.facebook.com/v21.0/me/accounts?fields=name,access_token,instagram_business_account{id,username}&access_token=LONG_LIVED_USER_TOKEN"
   ```
   The Page's `access_token` is now permanent.
4. `gh secret set IG_ACCESS_TOKEN --body 'PERMANENT_PAGE_TOKEN'`
5. Run **verify-ig** (`gh workflow run verify-ig.yml`) → expect `username: harvona_international_ai`.

### Option B (recurring) — re-extend before expiry
If you keep a user token, repeat steps 1–2 above before `2026-08-29` to mint a fresh 60-day token, then `gh secret set IG_ACCESS_TOKEN --body '…'` and run verify-ig. Set a calendar reminder ~1 week before expiry.

> Check any token's lifetime at the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) — **Expires: Never** means it's the permanent Page token.

## 5. Enhancement — real AI images via OpenAI / ChatGPT

The **only** code that changes is `generateImage()` in `src/lib/image.ts`. Publishing is unchanged — it just needs a JPEG `Buffer`. The image source is fully decoupled.

**Steps:**
1. Get an `OPENAI_API_KEY` (platform.openai.com, **personal** account — accenture.com is blocked). `gpt-image-1` requires **organization verification** (Settings → Organization → verify). Add billing.
2. `gh secret set OPENAI_API_KEY --body 'sk-...'` and add it to the `generate.yml` env block:
   ```yaml
   env:
     GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
     OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
   ```
3. Re-add an `image_prompt` to the Gemini output (it was removed when we went local): in `src/lib/gemini.ts`, add `image_prompt` back to `GeneratedPost`, the `responseSchema`, and the return; in `src/generate.ts` pass `post.imagePrompt` to `generateImage`.
4. Replace `generateImage()` in `src/lib/image.ts` (this is essentially the original implementation):
   ```ts
   export async function generateImage(prompt: string): Promise<Buffer> {
     const apiKey = process.env.OPENAI_API_KEY;
     if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
     const res = await fetch("https://api.openai.com/v1/images/generations", {
       method: "POST",
       headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
       body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", output_format: "jpeg", n: 1 }),
     });
     if (!res.ok) throw new Error(`Image generation failed (${res.status}): ${await res.text()}`);
     const data = (await res.json()) as { data: { b64_json: string }[] };
     return Buffer.from(data.data[0].b64_json, "base64");
   }
   ```
   (`output_format: "jpeg"` keeps Instagram happy. Cost: ~2–19¢ per image.)
5. `pnpm typecheck`, commit, push, run a draft. Keep the local-card version handy as a free fallback.

## 6. Enhancement — branded designs via Canva

Canva produces *polished, on-brand* designs (better than raw AI images or the sharp card). It's more setup but worth it for a brand. Same integration point: `generateImage()` returns a JPEG.

**Approach (Canva Connect API — verify exact endpoints at https://www.canva.dev/docs/connect/):**
1. **Canva Pro** account + a **Canva Developer** app (OAuth 2.0 client) at canva.dev. Scopes for design + asset export.
2. Build a reusable **Brand Template** in Canva with named placeholders (e.g. a `{{headline}}` text field).
3. In code: use the **Autofill API** to create a design from that template, filling `headline` (and any other fields) → poll the autofill job → **export** the design as PNG/JPEG → download the bytes → return as the JPEG `Buffer`.
4. Auth: Canva Connect uses OAuth; store the Canva token(s) as GitHub secrets (`CANVA_ACCESS_TOKEN`, refresh token, etc.). Canva tokens also expire — apply the same "refresh before expiry" discipline as §4.
5. Wire the brand `headline` (and optionally topic/caption snippet) from `generate.ts` into the autofill call.

Trade-off: Canva = best-looking, most setup (OAuth + template + token refresh). OpenAI = photoreal/illustrative, medium setup (+ org verification + billing). Local sharp card = free, instant, plainest — current default and a good fallback.

> Whichever you choose, keep the contract: `generateImage(...) => Promise<Buffer>` returning a **JPEG**. Nothing else in the pipeline needs to change.

## 7. Quick command reference

```powershell
# run the agent locally (needs GEMINI_API_KEY in .env)
pnpm install ; pnpm gen ; pnpm typecheck

# trigger workflows
gh workflow run generate.yml          # make a draft PR now
gh workflow run verify-ig.yml         # read-only credential check
gh workflow run publish.yml           # publish whatever is in /queue on main

# secrets (always use --body, not the interactive prompt)
gh secret set IG_ACCESS_TOKEN --body 'EAA...'
gh secret list

# watch a run
gh run list --workflow=generate.yml --limit 3
gh run view <run-id> --log-failed
```
