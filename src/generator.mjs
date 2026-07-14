const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_IDEA_MODEL = "gpt-5.6-luna";
const DEFAULT_REVIEW_MODEL = "gpt-5.6-terra";

const thresholds = { junior: 74, intermediate: 79, senior: 83 };
const categories = {
  mixed: "any suitable visual situation",
  "visual-geometry": "geometry, spatial reasoning, folding, tiling, symmetry, or measurement",
  "number-structures": "visual number structures, combinatorics, parity, invariants, or patterns",
  systems: "maps, networks, processes, probability, logic systems, or data interpretation",
};
const insightNames = [
  "area decomposition", "symmetry", "ratios", "coordinates", "angles",
  "graph interpretation", "combinatorics", "parity", "counting", "median",
  "probability", "transformations", "invariants", "number patterns",
];
const visualSeeds = [
  "strange polygon", "gears", "stacked blocks", "unusual tiling", "overlapping circles",
  "folded paper", "spinners", "reflections", "ladders", "mirrors", "rope around poles",
  "clock faces", "maps", "grids", "balance scales", "tanks", "shadows", "hexagonal rods",
  "matchsticks", "dice", "cubes", "gardens", "bridges", "trees", "islands",
];
const bannedPhrases = /\b(calculate|work\s+out|use\s+pythagoras|using\s+the\s+formula|substitute\s+into|solve\s+the\s+equation)\b/i;
const diagramBannedWords = /\b(perimeter|formula|equation|side\s+[abc]|answer|solution|calculate)\b/i;

const stringArray = { type: "array", items: { type: "string" } };
const scoreSchema = {
  type: "object",
  additionalProperties: false,
  required: ["originality", "elegance", "diagramQuality", "ahaFactor", "total"],
  properties: {
    originality: { type: "integer", minimum: 0, maximum: 25 },
    elegance: { type: "integer", minimum: 0, maximum: 25 },
    diagramQuality: { type: "integer", minimum: 0, maximum: 25 },
    ahaFactor: { type: "integer", minimum: 0, maximum: 25 },
    total: { type: "integer", minimum: 0, maximum: 100 },
  },
};
const candidateSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "title", "visualSituation", "singleInsight", "diagramInformation", "textInformation",
    "questionStem", "correctAnswer", "solutionSketch", "necessaryElements", "mistakeDistractors",
    "fingerprint", "scores", "worksheetRisk", "riskReason",
  ],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    visualSituation: { type: "string" },
    singleInsight: { type: "string", enum: insightNames },
    diagramInformation: stringArray,
    textInformation: stringArray,
    questionStem: { type: "string" },
    correctAnswer: { type: "string" },
    solutionSketch: stringArray,
    necessaryElements: stringArray,
    mistakeDistractors: stringArray,
    fingerprint: { type: "string" },
    scores: scoreSchema,
    worksheetRisk: { type: "boolean" },
    riskReason: { type: "string" },
  },
};
const ideaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: { type: "array", minItems: 8, maxItems: 8, items: candidateSchema },
  },
};
const solveReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "derivedAnswer", "solutionSteps", "uniqueAnswer", "internallyConsistent", "hiddenAssumptions", "verdict"],
        properties: {
          candidateId: { type: "string" },
          derivedAnswer: { type: "string" },
          solutionSteps: stringArray,
          uniqueAnswer: { type: "boolean" },
          internallyConsistent: { type: "boolean" },
          hiddenAssumptions: stringArray,
          verdict: { type: "string", enum: ["pass", "fail"] },
        },
      },
    },
  },
};
const criticReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId", "authenticity", "originality", "elegance", "diagramQuality", "ahaFactor",
          "difficultyFit", "total", "diagramEssential", "oneInsightOnly", "worksheetLike",
          "underTenSeconds", "issues", "verdict",
        ],
        properties: {
          candidateId: { type: "string" },
          authenticity: { type: "integer", minimum: 0, maximum: 20 },
          originality: { type: "integer", minimum: 0, maximum: 20 },
          elegance: { type: "integer", minimum: 0, maximum: 20 },
          diagramQuality: { type: "integer", minimum: 0, maximum: 15 },
          ahaFactor: { type: "integer", minimum: 0, maximum: 15 },
          difficultyFit: { type: "integer", minimum: 0, maximum: 10 },
          total: { type: "integer", minimum: 0, maximum: 100 },
          diagramEssential: { type: "boolean" },
          oneInsightOnly: { type: "boolean" },
          worksheetLike: { type: "boolean" },
          underTenSeconds: { type: "boolean" },
          issues: stringArray,
          verdict: { type: "string", enum: ["pass", "fail"] },
        },
      },
    },
  },
};

const allowedFills = ["none", "#ffffff", "#fffdf7", "#f4efe4", "#e8eef7", "#f4e5e8", "#e8f1e6", "#f3eadf", "#202124"];
const allowedStrokes = ["none", "#202124", "#5f6368"];
const primitiveSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "x", "y", "x2", "y2", "width", "height", "r", "rx", "ry", "points", "text", "fill", "stroke", "strokeWidth"],
  properties: {
    type: { type: "string", enum: ["line", "rect", "circle", "ellipse", "polygon", "text"] },
    x: { type: "number" }, y: { type: "number" }, x2: { type: "number" }, y2: { type: "number" },
    width: { type: "number" }, height: { type: "number" }, r: { type: "number" },
    rx: { type: "number" }, ry: { type: "number" }, points: { type: "string" }, text: { type: "string" },
    fill: { type: "string", enum: allowedFills },
    stroke: { type: "string", enum: allowedStrokes },
    strokeWidth: { type: "number", minimum: 0, maximum: 3 },
  },
};
const finalSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "prompt", "options", "correctAnswer", "answerType", "hint", "solutionSteps", "fingerprint",
    "singleInsight", "essentialDiagramFacts", "diagramAlt", "diagramPrimitives", "distractorRationales",
  ],
  properties: {
    prompt: { type: "string" },
    options: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } },
    correctAnswer: { type: "string" },
    answerType: { type: "string", enum: ["multipleChoice"] },
    hint: { type: "string" },
    solutionSteps: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
    fingerprint: { type: "string" },
    singleInsight: { type: "string", enum: insightNames },
    essentialDiagramFacts: { type: "array", minItems: 2, items: { type: "string" } },
    diagramAlt: { type: "string" },
    diagramPrimitives: { type: "array", minItems: 4, maxItems: 36, items: primitiveSchema },
    distractorRationales: {
      type: "array", minItems: 4, maxItems: 4,
      items: {
        type: "object", additionalProperties: false, required: ["option", "mistake"],
        properties: { option: { type: "string" }, mistake: { type: "string" } },
      },
    },
  },
};
const verificationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "pass", "derivedAnswer", "uniqueAnswer", "diagramMatches", "noHiddenAssumptions",
    "numbersConsistent", "difficultyAppropriate", "diagramEssential", "oneInsightOnly",
    "worksheetLike", "underTenSeconds", "issues",
  ],
  properties: {
    pass: { type: "boolean" },
    derivedAnswer: { type: "string" },
    uniqueAnswer: { type: "boolean" },
    diagramMatches: { type: "boolean" },
    noHiddenAssumptions: { type: "boolean" },
    numbersConsistent: { type: "boolean" },
    difficultyAppropriate: { type: "boolean" },
    diagramEssential: { type: "boolean" },
    oneInsightOnly: { type: "boolean" },
    worksheetLike: { type: "boolean" },
    underTenSeconds: { type: "boolean" },
    issues: stringArray,
  },
};

function allowedOrigins(env) {
  return String(env.PUZZLEFORGE_ALLOWED_ORIGINS || "https://stickstuition.com,https://www.stickstuition.com")
    .split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (!origin) return { vary: "Origin" };
  const allowed = allowedOrigins(env);
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin && !allowed.includes("*") && !allowed.includes(origin)) return null;
  return {
    "access-control-allow-origin": allowed.includes("*") ? "*" : origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function responseText(data) {
  if (typeof data.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) return part.text;
      if (part.type === "refusal") throw new Error(`OpenAI refusal: ${part.refusal || "request refused"}`);
    }
  }
  throw new Error("OpenAI returned no structured output text");
}

async function structuredCall({ stage, model, effort, instructions, input, schema, maxOutputTokens, fetchImpl, apiKey }) {
  const started = Date.now();
  console.log("[PuzzleForge] stage.start", { stage, model });
  const response = await fetchImpl(OPENAI_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort },
      text: { format: { type: "json_schema", name: stage, strict: true, schema } },
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI ${response.status} during ${stage}: ${detail.slice(0, 500)}`);
  }
  const data = await response.json();
  if (data.status && data.status !== "completed") throw new Error(`OpenAI ${stage} ended with status ${data.status}`);
  const parsed = JSON.parse(responseText(data));
  console.log("[PuzzleForge] stage.complete", { stage, durationMs: Date.now() - started, totalTokens: data.usage?.total_tokens });
  return parsed;
}

function normalize(value) {
  return String(value).replace(/[\s,]/g, "").toLowerCase();
}

function publicCandidate(candidate) {
  const { correctAnswer, solutionSketch, singleInsight, mistakeDistractors, scores, worksheetRisk, riskReason, ...visible } = candidate;
  return visible;
}

function selectTopCandidates(candidates, recentFingerprints) {
  if (candidates.length !== 8) throw new Error("Ideation did not return eight candidates");
  const ids = new Set(candidates.map((candidate) => candidate.id));
  const fingerprints = new Set(candidates.map((candidate) => candidate.fingerprint));
  if (ids.size !== 8 || fingerprints.size !== 8) throw new Error("Ideation repeated candidate identities");
  const eligible = candidates
    .filter((candidate) => !candidate.worksheetRisk && !recentFingerprints.includes(candidate.fingerprint))
    .filter((candidate) => !bannedPhrases.test(candidate.questionStem) && !candidate.questionStem.includes("="))
    .sort((a, b) => b.scores.total - a.scores.total);
  if (eligible.length < 3) throw new Error("Fewer than three original non-worksheet candidates survived ideation");
  return eligible.slice(0, 3);
}

function selectWinner(topCandidates, solveReviews, criticReviews, level) {
  const solves = new Map(solveReviews.map((review) => [review.candidateId, review]));
  const critiques = new Map(criticReviews.map((review) => [review.candidateId, review]));
  const eligible = topCandidates.filter((candidate) => {
    const solve = solves.get(candidate.id);
    const critic = critiques.get(candidate.id);
    return solve?.verdict === "pass" && solve.uniqueAnswer && solve.internallyConsistent
      && normalize(solve.derivedAnswer) === normalize(candidate.correctAnswer)
      && critic?.verdict === "pass" && critic.diagramEssential && critic.oneInsightOnly
      && !critic.worksheetLike && !critic.underTenSeconds && critic.total >= thresholds[level];
  }).sort((a, b) => critiques.get(b.id).total - critiques.get(a.id).total);
  if (!eligible.length) throw new Error("No candidate survived independent solving and competition-quality review");
  const winner = eligible[0];
  return { winner, solve: solves.get(winner.id), critic: critiques.get(winner.id), solves, critiques };
}

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function safePoints(value) {
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?(?:[ ,]+-?\d+(?:\.\d+)?)+$/.test(text)) throw new Error("Diagram polygon points were invalid");
  const values = text.split(/[ ,]+/).map(Number);
  if (values.length < 6 || values.length > 40 || values.length % 2) throw new Error("Diagram polygon had an invalid point count");
  return Array.from({ length: values.length / 2 }, (_, index) => {
    const x = clamp(values[index * 2], 0, 900);
    const y = clamp(values[index * 2 + 1], 0, 520);
    return `${x},${y}`;
  }).join(" ");
}

export function renderDiagramSvg(primitives, correctAnswer = "") {
  if (!Array.isArray(primitives) || primitives.length < 4 || primitives.length > 36) throw new Error("Diagram required 4 to 36 primitives");
  const exactAnswer = normalize(correctAnswer);
  let textCount = 0;
  const rendered = primitives.map((item) => {
    if (!allowedFills.includes(item.fill) || !allowedStrokes.includes(item.stroke)) throw new Error("Diagram used an unapproved colour");
    const fill = item.fill;
    const stroke = item.stroke;
    const strokeWidth = clamp(item.strokeWidth, 0, 3);
    const x = clamp(item.x, 20, 880); const y = clamp(item.y, 20, 500);
    const common = ` fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke"`;
    if (item.type === "line") return `<line x1="${x}" y1="${y}" x2="${clamp(item.x2, 20, 880)}" y2="${clamp(item.y2, 20, 500)}"${common}/>`;
    if (item.type === "rect") return `<rect x="${x}" y="${y}" width="${clamp(item.width, 1, 860)}" height="${clamp(item.height, 1, 480)}"${common}/>`;
    if (item.type === "circle") return `<circle cx="${x}" cy="${y}" r="${clamp(item.r, 1, 220)}"${common}/>`;
    if (item.type === "ellipse") return `<ellipse cx="${x}" cy="${y}" rx="${clamp(item.rx, 1, 320)}" ry="${clamp(item.ry, 1, 220)}"${common}/>`;
    if (item.type === "polygon") return `<polygon points="${safePoints(item.points)}"${common}/>`;
    if (item.type === "text") {
      textCount += 1;
      const label = String(item.text).trim();
      if (!label || label.length > 24 || diagramBannedWords.test(label) || label.includes("=")) throw new Error("Diagram contained an unsuitable label");
      if (exactAnswer && normalize(label) === exactAnswer) throw new Error("Diagram revealed the correct answer");
      return `<text x="${x}" y="${y}" fill="#202124" stroke="none" font-family="Georgia,serif" font-size="${clamp(item.height || 24, 16, 34)}" text-anchor="middle">${escapeXml(label)}</text>`;
    }
    throw new Error("Diagram contained an unsupported primitive");
  });
  if (textCount > 12) throw new Error("Diagram contained too many labels");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520" role="img"><rect width="900" height="520" fill="#fffdf7"/>${rendered.join("")}</svg>`;
}

export function makeDiagramDataUri(svg) {
  const value = String(svg || "").trim();
  if (!/^<svg[\s>]/i.test(value) || /<script|<foreignObject|\son[a-z]+\s*=|\shref\s*=|\sxlink:href\s*=/i.test(value)) throw new Error("Generated diagram was unsafe");
  return `data:image/svg+xml;base64,${Buffer.from(value).toString("base64")}`;
}

export function validateChallenge(challenge, verification, level, recentFingerprints) {
  if (bannedPhrases.test(challenge.prompt) || challenge.prompt.includes("=")) throw new Error("Question used worksheet-style wording");
  if (challenge.options.length !== 5 || new Set(challenge.options.map(normalize)).size !== 5) throw new Error("Question options were not five distinct values");
  if (challenge.options.filter((option) => normalize(option) === normalize(challenge.correctAnswer)).length !== 1) throw new Error("Correct answer did not appear exactly once");
  if (recentFingerprints.includes(challenge.fingerprint)) throw new Error("Question repeated a recent structure");
  const verified = verification.pass && verification.uniqueAnswer && verification.diagramMatches
    && verification.noHiddenAssumptions && verification.numbersConsistent && verification.difficultyAppropriate
    && verification.diagramEssential && verification.oneInsightOnly && !verification.worksheetLike
    && !verification.underTenSeconds && normalize(verification.derivedAnswer) === normalize(challenge.correctAnswer);
  if (!verified) throw new Error(`Final verification failed: ${verification.issues.join("; ")}`);
  if (!thresholds[level]) throw new Error("Unknown difficulty level");
}

async function forgeWithAI({ level, category, recentFingerprints, env, fetchImpl }) {
  const ideaModel = env.PUZZLEFORGE_IDEA_MODEL || DEFAULT_IDEA_MODEL;
  const reviewModel = env.PUZZLEFORGE_REVIEW_MODEL || DEFAULT_REVIEW_MODEL;
  const family = categories[category] || categories.mixed;
  const levelRule = {
    junior: "one discoverable insight, accessible arithmetic, but not immediately obvious",
    intermediate: "one strong insight with two facts that must be connected",
    senior: "one deep organising insight with several consequences, without long computation",
  }[level];

  const ideas = await structuredCall({
    stage: "visual_concepts",
    model: ideaModel,
    effort: "low",
    schema: ideaSchema,
    maxOutputTokens: 5200,
    fetchImpl,
    apiKey: env.OPENAI_API_KEY,
    instructions: `You invent original school mathematics competition concepts. Start from a picture, never from an equation or curriculum objective. Each concept hides exactly one mathematical insight. Do not imitate, paraphrase, or reproduce any known competition problem. Return eight genuinely different concepts and score every one honestly. Mark anything worksheet-like as worksheetRisk=true.`,
    input: `Level: ${level} (${levelRule}). Preferred family: ${family}.

First imagine eight curious pictures drawn from or beyond: ${visualSeeds.join(", ")}. Only after each picture exists, hide exactly one insight chosen from: ${insightNames.join(", ")}.

For every concept split the information roughly half into diagramInformation and half into textInformation. Removing either half must make the problem unsolvable. Every label and number must matter. Arithmetic must be easy after the aha moment. Natural stems include “What is the area…”, “How many…”, “Which point…”, “What fraction…”, or “What is the value of…”. Never use “calculate”, “work out”, “use Pythagoras”, formula instructions, an opening equation, repetitive computation, or a decorative diagram.

Score originality, elegance, diagram quality, and aha factor out of 25; total must equal their sum. Reject concepts answerable in under ten seconds. Avoid recent fingerprints: ${recentFingerprints.join(" | ") || "none"}.`,
  });
  const topCandidates = selectTopCandidates(ideas.candidates, recentFingerprints);
  const blindCandidates = topCandidates.map(publicCandidate);

  const [solving, criticism] = await Promise.all([
    structuredCall({
      stage: "independent_solves",
      model: reviewModel,
      effort: "medium",
      schema: solveReviewSchema,
      maxOutputTokens: 3000,
      fetchImpl,
      apiKey: env.OPENAI_API_KEY,
      instructions: "You are an independent competition-mathematics solver. You are not shown the designer's intended answer or insight. Solve each proposed problem solely from its visible text and diagram facts. Fail it for ambiguity, inconsistency, missing data, multiple answers, or hidden assumptions.",
      input: JSON.stringify({ level, candidates: blindCandidates }),
    }),
    structuredCall({
      stage: "competition_critique",
      model: reviewModel,
      effort: "medium",
      schema: criticReviewSchema,
      maxOutputTokens: 3000,
      fetchImpl,
      apiKey: env.OPENAI_API_KEY,
      instructions: "You are a severe editor for original school mathematics competitions. Reject curriculum exercises, substitution, decorative diagrams, repetitive calculation, multiple insights, giveaway wording, and questions answerable in under ten seconds. A pass should look professionally conceived and create one satisfying aha moment. Do not reward a concept merely because it is valid.",
      input: JSON.stringify({ level, threshold: thresholds[level], candidates: topCandidates }),
    }),
  ]);
  const selected = selectWinner(topCandidates, solving.reviews, criticism.reviews, level);

  const challenge = await structuredCall({
    stage: "final_competition_item",
    model: reviewModel,
    effort: "high",
    schema: finalSchema,
    maxOutputTokens: 5000,
    fetchImpl,
    apiKey: env.OPENAI_API_KEY,
    instructions: `You are a competition-paper editor and diagram specifier. Develop only the supplied winning visual concept. Preserve its one insight and independently verified answer. Write concise natural wording, five plausible options, and four distractors based on realistic mistakes. The diagram must carry essential information and use generous whitespace, thin black or grey lines, and subtle pastel fills. Return declarative primitives only—never SVG, equations, formula annotations, full sentences in the diagram, red/blue emphasis, or labels such as Side A. Unused primitive fields must be zero or empty strings.`,
    input: JSON.stringify({
      level,
      concept: selected.winner,
      independentSolve: selected.solve,
      editorialReview: selected.critic,
      primitiveCanvas: { width: 900, height: 520, allowedFills, allowedStrokes, maxStrokeWidth: 3 },
    }),
  });
  challenge.fingerprint = selected.winner.fingerprint;
  challenge.singleInsight = selected.winner.singleInsight;

  const verifierView = {
    prompt: challenge.prompt,
    options: challenge.options,
    diagramPrimitives: challenge.diagramPrimitives,
    essentialDiagramFacts: challenge.essentialDiagramFacts,
    level,
  };
  const verification = await structuredCall({
    stage: "final_verification",
    model: reviewModel,
    effort: "high",
    schema: verificationSchema,
    maxOutputTokens: 2200,
    fetchImpl,
    apiKey: env.OPENAI_API_KEY,
    instructions: "You are the final independent competition examiner. Derive the answer without seeing the editor's answer or solution. Reject the item unless exactly one option follows, every diagram fact matches, there are no hidden assumptions, the diagram is essential, only one insight is needed, the level is appropriate, it is not a worksheet exercise, and it cannot be answered in under ten seconds. pass may be true only when every positive condition is true and both negative conditions are false.",
    input: JSON.stringify(verifierView),
  });
  validateChallenge(challenge, verification, level, recentFingerprints);
  const diagramSvg = renderDiagramSvg(challenge.diagramPrimitives, challenge.correctAnswer);
  const auditConcepts = ideas.candidates.map((candidate) => {
    const solve = selected.solves.get(candidate.id);
    const critic = selected.critiques.get(candidate.id);
    return {
      title: candidate.title,
      fingerprint: candidate.fingerprint,
      hiddenInsight: candidate.singleInsight,
      status: candidate.id === selected.winner.id ? "winner" : topCandidates.some((item) => item.id === candidate.id) ? "finalist" : "rejected",
      score: critic?.total ?? candidate.scores.total,
      reason: critic?.issues.join(" ") || candidate.riskReason || "Did not reach the independent-review shortlist.",
      solution: solve?.solutionSteps || candidate.solutionSketch,
    };
  });
  return { challenge, verification, diagramSvg, auditConcepts, qualityScore: selected.critic.total };
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
    const recentFingerprints = Array.isArray(input.recentFingerprints) ? input.recentFingerprints.slice(-8).map(String) : [];
    const result = await forgeWithAI({ level, category, recentFingerprints, env, fetchImpl });
    const { diagramPrimitives, distractorRationales, essentialDiagramFacts, singleInsight, ...question } = result.challenge;
    return jsonResponse({
      ...question,
      level,
      category,
      qualityScore: result.qualityScore,
      source: "ai",
      diagramDataUri: makeDiagramDataUri(result.diagramSvg),
      audit: {
        threshold: thresholds[level],
        winnerFingerprint: result.challenge.fingerprint,
        concepts: result.auditConcepts,
        visualReport: {
          pass: result.verification.pass,
          mathematicallyFaithful: result.verification.diagramMatches,
          legible: true,
          issues: result.verification.issues,
        },
        notes: [
          "Eight visual-first concepts were scored before development.",
          "Three finalists were independently solved and critically reviewed.",
          `The winner uses one insight: ${singleInsight}.`,
          `${essentialDiagramFacts.length} essential diagram facts survived final verification.`,
          `${distractorRationales.length} distractors are tied to realistic mistakes.`,
        ],
      },
    }, 200, cors);
  } catch (error) {
    const diagnostic = String(error?.message || "Unknown generation failure").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 900);
    const authFailed = /OpenAI 401|invalid_issuer|invalid_api_key/i.test(diagnostic);
    console.error("[PuzzleForge] generation.failed", { diagnostic });
    return jsonResponse(authFailed
      ? { error: "OpenAI rejected the configured API key.", code: "AI_AUTH_FAILED" }
      : { error: "No candidate cleared the independent competition-quality checks. Please forge again.", code: "GENERATION_FAILED" }, authFailed ? 503 : 502, cors);
  }
}
