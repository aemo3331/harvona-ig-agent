# Harvona Instagram Content Agent

An automated content agent for **[@harvona_international_ai](https://www.instagram.com/harvona_international_ai/)**.
It generates an image + caption with AI, queues each post as a GitHub **pull request** for you to review,
and — once you merge — publishes it to Instagram via the official Graph API.

```
 ┌─ GENERATE (scheduled) ─────────────────────────────┐
 │  Gemini writes caption + hashtags + headline        │
 │  A branded image card is rendered locally (sharp)   │
 │  Commits to /queue and opens a Pull Request         │
 └─────────────────────────────────────────────────────┘
            │  you review the PR →  merge = approve,  close = reject
            ▼
 ┌─ PUBLISH (on merge to main) ───────────────────────┐
 │  Instagram Graph API: create container → publish    │
 │  Moves the item to /published                       │
 └─────────────────────────────────────────────────────┘
```

- **Generation:** Google Gemini writes the copy (`gemini-2.5-flash`, free tier) + a short headline; the image is a **branded card rendered locally with `sharp`** (no image API — Gemini's image model needs a paid tier). Output is JPEG (Instagram requires it). Swap in real AI images later by editing `src/lib/image.ts`.
- **Review queue:** native GitHub PRs — the image renders right in the diff.
- **Publishing:** Instagram Graph API (the sanctioned, ToS-safe path — no browser automation).

---

## One-time setup

### 1. Instagram / Meta prerequisites (you do these once)

These require entering credentials and changing account settings, so they're yours to do:

1. **Convert the account to Business or Creator.** In the Instagram app: *Settings → Account type and tools → Switch to professional account*.
2. **Link it to a Facebook Page.** The Graph API publishes through a Page. Create one if needed and connect the IG account to it.
3. **Create a Meta app** at <https://developers.facebook.com> → *My Apps → Create App* → type **Business**.
4. **Add the Instagram product** and generate a **long-lived access token** with these scopes:
   `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (and `pages_show_list`).
   The Graph API Explorer or the Access Token Tool can mint this.
5. **Find your IG user id** (the numeric `IG_USER_ID`, *not* the @handle):
   `GET /me/accounts` → your Page → `GET /{page-id}?fields=instagram_business_account`.

> **Token lifetime:** long-lived tokens last ~60 days. Refresh before expiry (or automate a refresh).
> **App Review:** publishing to *your own* account works in the app's **Development** mode. Going fully
> public/automated later requires Meta **App Review** for `instagram_content_publish`.
> **Daily limit:** the API allows ~50 published posts per 24h — far above this agent's cadence.

### 2. Repository

The image is served to Instagram via `raw.githubusercontent.com`, which only works for **public** repos.
Either make this repo public, or change `src/lib/instagram.ts` to host images elsewhere
(Vercel Blob, S3, Cloudinary) and return that URL instead.

Create the repo and push:

```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-org>/harvona-ig-agent.git
git push -u origin main
```

### 3. GitHub Actions secrets

Repo → *Settings → Secrets and variables → Actions → New repository secret*:

| Secret            | Used by   | What it is                                              |
| ----------------- | --------- | ------------------------------------------------------- |
| `GEMINI_API_KEY`  | generate  | Google AI Studio API key — captions **and** images      |
| `IG_USER_ID`      | publish   | Instagram Business account numeric id                   |
| `IG_ACCESS_TOKEN` | publish   | Long-lived Graph API token with the scopes above        |

Get `GEMINI_API_KEY` free at [aistudio.google.com](https://aistudio.google.com) (a personal Google account works;
the consumer "Gemini Advanced / Google Pro" subscription is separate and does **not** include API access).

Set secrets from the repo with the GitHub CLI (the value is entered at a hidden prompt, never on the command line):

```powershell
gh secret set GEMINI_API_KEY    # run inside the repo, or add -R <owner>/<repo>
```

Workflow permissions (write + PR creation) are already enabled on this repo. To re-check:
*Settings → Actions → General → Workflow permissions* → **Read and write** + **Allow GitHub Actions to create and approve pull requests**.

---

## How it runs

- **`generate.yml`** runs on a schedule (default Mon/Wed/Fri 13:00 UTC — edit the `cron`) or on demand
  (*Actions → Generate post → Run workflow*, with an optional topic override). It drafts a post and opens a PR.
- You **review the PR** (open `queue/<id>/PREVIEW.md` in the *Files changed* tab to see the image + caption).
- **Merge** the PR → `publish.yml` fires, publishes the post, and moves it to `published/`.
  **Close** the PR → nothing happens; the draft is discarded.

## Customising

- **Voice, topics, image style:** edit `content.config.json`.
- **Cadence:** edit the `cron` in `.github/workflows/generate.yml`.
- **Caption model:** `gemini-2.5-flash` in `src/lib/gemini.ts` (override with the `GEMINI_TEXT_MODEL` env var).
- **Image card:** rendered locally in `src/lib/image.ts` (SVG → JPEG via `sharp`) — colors, layout, and fonts
  are edited right in that file. To switch to **real AI images** later (e.g. Gemini's `gemini-2.5-flash-image`
  / Imagen, which need a billing-enabled Google tier), replace the body of `generateImage()` — keep it returning a JPEG `Buffer`.

## Local development

```bash
pnpm install
cp .env.example .env   # fill in your keys
pnpm gen               # generate a draft into ./queue (no posting)
pnpm typecheck
# pnpm publish:posts   # publishes queued items — only run when you mean it
```

> `pnpm publish:posts` posts to the live account. Don't run it casually; that's what the merge-gated workflow is for.

## Project layout

```
src/
  generate.ts        # orchestrates one draft → writes queue/<id>/
  publish.ts         # publishes approved queue items → published/<id>/
  lib/gemini.ts      # caption + hashtags + image prompt (Gemini, structured output)
  lib/image.ts       # image generation (Gemini native image -> JPEG via sharp)
  lib/instagram.ts   # Graph API: create container → publish
.github/workflows/
  generate.yml       # scheduled generation → opens PR
  publish.yml        # on merge to main → publishes
content.config.json  # brand voice, topics, image style
queue/               # drafts awaiting review (PRs add here)
published/           # archive of published posts + Graph media ids
```
