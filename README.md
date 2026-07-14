# PuzzleForge Vercel API

This is the isolated server-side generator for PuzzleForge. The GameLab website can remain on Netlify; only this small API project needs to run on Vercel.

## Why it is separate

- Deploying this directory does not rebuild the Sticks Tuition website.
- `OPENAI_API_KEY` stays on the server and is never sent to the browser.
- The generator gets a 300-second Vercel function limit.
- Only approved website origins can call the endpoint from a browser.
- Eight visual-first concepts are scored before three finalists are independently solved and reviewed.
- Diagrams are rendered from constrained primitives instead of accepting model-authored SVG markup.

## Local checks (no OpenAI request)

```powershell
npm test
npm run check
```

## Deploy when ready

1. Create a new empty GitHub repository for this directory.
2. Import that repository into Vercel as a new project.
3. Add these Vercel environment variables for Production and Preview:
   - `OPENAI_API_KEY` — a current OpenAI Platform API key.
   - `PUZZLEFORGE_ALLOWED_ORIGINS` — comma-separated website origins, for example `https://stickstuition.com,https://www.stickstuition.com`.
   - `PUZZLEFORGE_IDEA_MODEL` — optional; defaults to `gpt-5.6-luna`.
   - `PUZZLEFORGE_REVIEW_MODEL` — optional; defaults to `gpt-5.6-terra`.
4. Deploy and open `https://YOUR-PROJECT.vercel.app/api/health`. It should return `ok: true` and `openAIConfigured: true`.

Do not put a real key in `.env.example`, GitHub, the frontend, or a chat message.

## Connect GameLab after Vercel supplies the URL

In `games/puzzleforge/puzzleforge-app.js`, replace:

```js
fetch("/.netlify/functions/puzzleforge-generate", {
```

with:

```js
fetch("https://YOUR-PROJECT.vercel.app/api/generate", {
```

That one website change needs one final Netlify deploy. Future API changes and Vercel deployments will not rebuild the main website.

## Endpoints

- `GET /api/health` checks deployment and environment configuration without calling OpenAI.
- `OPTIONS /api/generate` handles browser CORS preflight without calling OpenAI.
- `POST /api/generate` creates a reviewed challenge and returns the response shape already used by PuzzleForge.
