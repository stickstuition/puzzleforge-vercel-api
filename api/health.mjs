export default function handler() {
  return Response.json({
    service: "puzzleforge-vercel-api",
    ok: true,
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
  }, {
    headers: { "cache-control": "no-store" },
  });
}

