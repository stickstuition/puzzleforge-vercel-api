const OPENAI_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

const thresholds = { junior: 72, intermediate: 78, senior: 82 };
const categories = {
  mixed: "any of the three approved families",
  "visual-geometry": "visual geometry and measurement",
  "number-structures": "combinatorial patterns and number structures",
  systems: "systems, processes and probability",
};
const banList = [
  "single missing angle",
  "ordinary perimeter or area substitution",
  "ordinary spinner probability",
  "direct reflection",
  "visible next-term sequence",
  "mean calculation",
  "formula substitution",
  "large arithmetic as difficulty",
  "decorative diagram",
  "routine worksheet exercise",
];

const stringArray = { type: "array", items: { type: "string" } };
const conceptSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "fingerprint", "hiddenInsight", "status", "score", "reason", "solution"],
  properties: {
    title: { type: "string" },
    fingerprint: { type: "string" },
    hiddenInsight: { type: "string" },
    status: { type: "string", enum: ["winner", "finalist", "rejected"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    solution: stringArray,
  },
};
const forgeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "prompt", "options", "correctAnswer", "answerType", "hint", "solutionSteps",
    "diagramSvg", "diagramAlt", "fingerprint", "qualityScore", "concepts", "visualReview",
  ],
  properties: {
    prompt: { type: "string" },
    options: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } },
    correctAnswer: { type: "string" },
    answerType: { type: "string", enum: ["multipleChoice"] },
    hint: { type: "string" },
    solutionSteps: { type: "array", minItems: 2, items: { type: "string" } },
    diagramSvg: { type: "string" },
    diagramAlt: { type: "string" },
    fingerprint: { type: "string" },
    qualityScore: { type: "integer", minimum: 0, maximum: 100 },
    concepts: { type: "array", minItems: 5, maxItems: 5, items: conceptSchema },
    visualReview: {
      type: "object",
      additionalProperties: false,
      required: ["pass", "mathematicallyFaithful", "legible", "issues"],
      properties: {
        pass: { type: "boolean" },
        mathematicallyFaithful: { type: "boolean" },
        legible: { type: "boolean" },
        issues: stringArray,
      },
    },
  },
};

function allowedOrigins(env) {
  return String(env.PUZZLEFORGE_ALLOWED_ORIGINS || "https://stickstuition.com,https://www.stickstuition.com")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (!origin) return { vary: "Origin" };
  const allowed = allowedOrigins(env);
  if (!allowed.includes("*") && !allowed.includes(origin)) return null;
  return {
    "access-control-allow-origin": allowed.includes("*") ? "*" : origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

async function forgeWithAI({ level, category, recentFingerprints, env, fetchImpl }) {
  const family = categories[category] || categories.mixed;
  const system = "You are the complete PuzzleForge review panel. Work through six internal roles in order: concept designer, independent solver, diagram engineer, visual reviewer, difficulty critic, and final editor. Generate five structurally distinct concepts, fully develop and independently solve the strongest three, reject routine or ambiguous work, score every developed candidate, and return only the highest-scoring valid challenge. Never choose the first merely valid idea. The SVG is essential mathematical content and must be exact.";
  const prompt = `Create an original ${level} challenge in ${family}.

Quality threshold: ${thresholds[level]}/100. Score originality /25, reasoning /20, diagram /20, clarity /15, distractors /10, and level suitability /10. Junior needs one genuine insight; Intermediate must connect two facts; Senior needs multiple constraint-driven steps.

Generate five compact audit concepts: exactly one winner, two finalists, and two rejected. Give each a distinct short fingerprint, a one-sentence hidden insight, honest score, one-sentence reason, and one short solution summary. The winner must have one unique answer appearing exactly once among five plausible A-E options. Keep the insight hidden from the player prompt.

The diagram must carry essential information. Create a self-contained landscape SVG with viewBox="0 0 900 520", xmlns="http://www.w3.org/2000/svg", a warm-white background, explicit fills and strokes, crisp dark lines, restrained #c6001c and #284f9e accents, and large legible essential labels. Use only essential SVG shapes, paths, lines and text. No scripts, stylesheets, links, external assets, foreignObject, branding, answer, decorative scenery, or announced trick. Internally inspect it against the solved mathematics before setting visualReview.pass.

Never imitate or reproduce any supplied or known paper's wording, numbers, diagram, characters, sequence, or branding. Avoid: ${banList.join(", ")}.

Do not repeat these recent structural fingerprints: ${recentFingerprints.join(" | ") || "none"}.`;

  const response = await fetchImpl(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.PUZZLEFORGE_TEXT_MODEL || DEFAULT_MODEL,
      max_tokens: 2600,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "forged_challenge", schema: forgeSchema, strict: true },
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 500)}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned no structured challenge");
  return JSON.parse(text);
}

export function makeDiagramDataUri(raw) {
  const svg = String(raw || "").trim();
  if (!/^<svg[\s>]/i.test(svg) || svg.length < 120 || svg.length > 60000) {
    throw new Error("AI diagram was not a valid SVG");
  }
  if (/<script|<foreignObject|\son[a-z]+\s*=|\shref\s*=|\sxlink:href\s*=|url\s*\(/i.test(svg)) {
    throw new Error("AI diagram contained unsafe SVG content");
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function validateChallenge(challenge, level, recentFingerprints) {
  const normalize = (value) => String(value).replace(/[\s,]/g, "").toLowerCase();
  const statuses = challenge.concepts.map((concept) => concept.status);
  const fingerprints = challenge.concepts.map((concept) => concept.fingerprint);
  const answerCount = challenge.options.filter((option) => normalize(option) === normalize(challenge.correctAnswer)).length;
  const valid = challenge.qualityScore >= thresholds[level]
    && challenge.options.length === 5
    && new Set(challenge.options.map(normalize)).size === 5
    && answerCount === 1
    && statuses.filter((status) => status === "winner").length === 1
    && statuses.filter((status) => status === "finalist").length === 2
    && statuses.filter((status) => status === "rejected").length === 2
    && new Set(fingerprints).size === 5
    && !recentFingerprints.includes(challenge.fingerprint)
    && challenge.visualReview.pass
    && challenge.visualReview.mathematicallyFaithful
    && challenge.visualReview.legible;
  if (!valid) throw new Error("AI challenge failed deterministic quality gates");
}

export async function handleGenerate(request, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const cors = corsHeaders(request, env);
  if (!cors) return jsonResponse({ error: "Origin not allowed", code: "ORIGIN_NOT_ALLOWED" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, { ...cors, allow: "POST, OPTIONS" });
  if (!env.OPENAI_API_KEY) return jsonResponse({ error: "PuzzleForge AI is not configured", code: "AI_NOT_CONFIGURED" }, 503, cors);

  try {
    const input = await request.json().catch(() => ({}));
    const level = Object.hasOwn(thresholds, input.level) ? input.level : "junior";
    const category = Object.hasOwn(categories, input.category) ? input.category : "mixed";
    const recentFingerprints = Array.isArray(input.recentFingerprints)
      ? input.recentFingerprints.slice(-8).map(String)
      : [];
    const challenge = await forgeWithAI({ level, category, recentFingerprints, env, fetchImpl });
    validateChallenge(challenge, level, recentFingerprints);
    const diagramDataUri = makeDiagramDataUri(challenge.diagramSvg);
    const { diagramSvg, visualReview, ...question } = challenge;
    return jsonResponse({
      ...question,
      level,
      category,
      source: "ai",
      diagramDataUri,
      audit: {
        threshold: thresholds[level],
        winnerFingerprint: challenge.fingerprint,
        concepts: challenge.concepts,
        visualReport: visualReview,
        notes: ["AI-generated precision SVG passed deterministic safety and quality gates."],
      },
    }, 200, cors);
  } catch (error) {
    const diagnostic = String(error?.message || "Unknown generation failure")
      .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
      .slice(0, 700);
    const authFailed = /OpenAI 401|invalid_issuer|invalid_api_key/i.test(diagnostic);
    console.error("PuzzleForge generation failed", diagnostic);
    return jsonResponse(authFailed
      ? { error: "OpenAI rejected the configured API key.", code: "AI_AUTH_FAILED" }
      : { error: "The AI challenge did not clear review. Please forge another.", code: "GENERATION_FAILED" }, authFailed ? 503 : 502, cors);
  }
}

