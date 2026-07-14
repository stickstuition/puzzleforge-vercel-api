import assert from "node:assert/strict";
import test from "node:test";
import generateRoute from "../api/generate.mjs";
import healthRoute from "../api/health.mjs";
import { handleGenerate, makeDiagramDataUri, renderDiagramSvg, validateChallenge } from "../src/generator.mjs";

const candidate = (index, overrides = {}) => ({
  id: `candidate-${index}`,
  title: `Visual concept ${index}`,
  visualSituation: `A curious arrangement of shaded tiles ${index}`,
  singleInsight: "symmetry",
  diagramInformation: ["A central line", "Three labelled regions"],
  textInformation: ["Equal tiles have equal area"],
  questionStem: "What fraction of the design is shaded?",
  correctAnswer: index === 1 ? "12" : String(12 + index),
  solutionSketch: ["Pair matching regions by symmetry.", "Count one representative from each pair."],
  necessaryElements: ["central line", "three labels"],
  mistakeDistractors: ["counts the centre twice", "misses a reflected region", "uses the unshaded part", "counts boundaries"],
  fingerprint: `visual-symmetry-${index}`,
  scores: { originality: 22 - index, elegance: 23 - index, diagramQuality: 22 - index, ahaFactor: 23 - index, total: 90 - index * 4 },
  worksheetRisk: index > 5,
  riskReason: index > 5 ? "Too routine to shortlist." : "No material risk found.",
  ...overrides,
});

const candidates = Array.from({ length: 8 }, (_, index) => candidate(index + 1));
const topThree = candidates.slice(0, 3);
const solves = {
  reviews: topThree.map((item) => ({
    candidateId: item.id,
    derivedAnswer: item.correctAnswer,
    solutionSteps: ["Pair the reflected pieces.", "Count the resulting equal groups."],
    uniqueAnswer: true,
    internallyConsistent: true,
    hiddenAssumptions: [],
    verdict: "pass",
  })),
};
const critiques = {
  reviews: topThree.map((item, index) => ({
    candidateId: item.id,
    authenticity: 19 - index,
    originality: 18 - index,
    elegance: 19 - index,
    diagramQuality: 14,
    ahaFactor: 14,
    difficultyFit: 9,
    total: 93 - index * 5,
    diagramEssential: true,
    oneInsightOnly: true,
    worksheetLike: false,
    underTenSeconds: false,
    issues: [],
    verdict: "pass",
  })),
};
const primitives = [
  { type: "rect", x: 180, y: 100, x2: 0, y2: 0, width: 540, height: 300, r: 0, rx: 0, ry: 0, points: "", text: "", fill: "#ffffff", stroke: "#202124", strokeWidth: 2 },
  { type: "line", x: 450, y: 100, x2: 450, y2: 400, width: 0, height: 0, r: 0, rx: 0, ry: 0, points: "", text: "", fill: "none", stroke: "#202124", strokeWidth: 1.5 },
  { type: "polygon", x: 0, y: 0, x2: 0, y2: 0, width: 0, height: 0, r: 0, rx: 0, ry: 0, points: "180,100 450,100 450,250 180,400", text: "", fill: "#e8eef7", stroke: "#202124", strokeWidth: 1.5 },
  { type: "text", x: 315, y: 260, x2: 0, y2: 0, width: 0, height: 24, r: 0, rx: 0, ry: 0, points: "", text: "3", fill: "#202124", stroke: "none", strokeWidth: 0 },
  { type: "text", x: 585, y: 260, x2: 0, y2: 0, width: 0, height: 24, r: 0, rx: 0, ry: 0, points: "", text: "?", fill: "#202124", stroke: "none", strokeWidth: 0 },
];
const finalItem = {
  prompt: "The two halves of the design correspond under reflection. What is the value of the region marked ?",
  options: ["8", "10", "12", "14", "16"],
  correctAnswer: "12",
  answerType: "multipleChoice",
  hint: "Look for parts exchanged by the central line.",
  solutionSteps: ["Match each region with its reflection.", "The corresponding value is 12."],
  fingerprint: "visual-symmetry-1",
  singleInsight: "symmetry",
  essentialDiagramFacts: ["The central line is the axis of reflection.", "The labelled regions correspond."],
  diagramAlt: "A rectangular design divided by a vertical line with corresponding regions on each side.",
  diagramPrimitives: primitives,
  distractorRationales: [
    { option: "8", mistake: "misses a reflected part" },
    { option: "10", mistake: "counts the central region once" },
    { option: "14", mistake: "counts the central region twice" },
    { option: "16", mistake: "uses all visible regions" },
  ],
};
const verification = {
  pass: true,
  derivedAnswer: "12",
  uniqueAnswer: true,
  diagramMatches: true,
  noHiddenAssumptions: true,
  numbersConsistent: true,
  difficultyAppropriate: true,
  diagramEssential: true,
  oneInsightOnly: true,
  worksheetLike: false,
  underTenSeconds: false,
  issues: [],
};

function responsesFetch(fixtures, seenStages = []) {
  let index = 0;
  return async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const request = JSON.parse(options.body);
    const stage = request.text.format.name;
    seenStages.push(stage);
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    const fixture = fixtures[index++];
    assert.ok(fixture, `Unexpected OpenAI call for ${stage}`);
    return Response.json({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(fixture) }] }],
      usage: { total_tokens: 100 },
    });
  };
}

test("Vercel route wrappers expose Web Handler fetch methods", async () => {
  assert.equal(typeof generateRoute.fetch, "function");
  assert.equal(typeof healthRoute.fetch, "function");
  const response = await healthRoute.fetch(new Request("https://api.example/api/health"));
  assert.equal((await response.json()).ok, true);
});

test("diagram renderer enforces competition-paper styling", () => {
  const svg = renderDiagramSvg(primitives, "12");
  assert.match(svg, /stroke-width="1\.5"/);
  assert.match(svg, /font-family="Georgia,serif"/);
  assert.doesNotMatch(svg, /#c6001c|<script/i);
  assert.match(makeDiagramDataUri(svg), /^data:image\/svg\+xml;base64,/);
  assert.throws(() => renderDiagramSvg([...primitives, { ...primitives[3], text: "x = 4" }], "12"), /unsuitable label/);
  assert.throws(() => renderDiagramSvg([...primitives, { ...primitives[3], text: "12" }], "12"), /revealed the correct answer/);
});

test("final quality gate rejects worksheet wording", () => {
  assert.doesNotThrow(() => validateChallenge(finalItem, verification, "junior", []));
  assert.throws(() => validateChallenge({ ...finalItem, prompt: "Calculate the missing value." }, verification, "junior", []), /worksheet-style/);
});

test("CORS preflight is handled without calling OpenAI", async () => {
  const request = new Request("https://api.example/api/generate", { method: "OPTIONS", headers: { origin: "https://stickstuition.com" } });
  const response = await handleGenerate(request, {
    env: { PUZZLEFORGE_ALLOWED_ORIGINS: "https://stickstuition.com" },
    fetchImpl: () => assert.fail("OpenAI must not be called"),
  });
  assert.equal(response.status, 204);
});

test("unknown browser origins are rejected", async () => {
  const request = new Request("https://api.example/api/generate", {
    method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}",
  });
  const response = await handleGenerate(request, {
    env: { OPENAI_API_KEY: "test-only", PUZZLEFORGE_ALLOWED_ORIGINS: "https://stickstuition.com" },
  });
  assert.equal(response.status, 403);
});

test("visual-first five-call pipeline preserves the frontend contract", async () => {
  const stages = [];
  const request = new Request("https://puzzleforge-vercel-api.vercel.app/api/generate", {
    method: "POST",
    headers: { origin: "https://puzzleforge-vercel-api.vercel.app", "content-type": "application/json" },
    body: JSON.stringify({ level: "junior", category: "mixed", recentFingerprints: [] }),
  });
  const response = await handleGenerate(request, {
    env: { OPENAI_API_KEY: "test-only", PUZZLEFORGE_ALLOWED_ORIGINS: "https://stickstuition.com" },
    fetchImpl: responsesFetch([{ candidates }, solves, critiques, finalItem, verification], stages),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(stages, ["visual_concepts", "independent_solves", "competition_critique", "final_competition_item", "final_verification"]);
  assert.equal(body.source, "ai");
  assert.equal(body.correctAnswer, "12");
  assert.equal(body.qualityScore, 93);
  assert.match(body.diagramDataUri, /^data:image\/svg\+xml;base64,/);
  assert.equal(body.audit.concepts.length, 8);
  assert.equal(body.audit.concepts.filter((item) => item.status === "winner").length, 1);
  assert.equal(body.diagramPrimitives, undefined);
});
