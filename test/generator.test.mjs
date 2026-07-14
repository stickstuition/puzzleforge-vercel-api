import assert from "node:assert/strict";
import test from "node:test";
import generateRoute from "../api/generate.mjs";
import healthRoute from "../api/health.mjs";
import { handleGenerate, makeDiagramDataUri, validateChallenge } from "../src/generator.mjs";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520"><rect width="900" height="520" fill="#fffaf0"/><line x1="100" y1="100" x2="800" y2="400" stroke="#111" stroke-width="8"/><text x="420" y="260" font-size="48">12</text></svg>';
const concepts = [
  ["Winner", "grid-ratio", "winner", 88],
  ["Final A", "fold-count", "finalist", 82],
  ["Final B", "route-parity", "finalist", 80],
  ["Reject A", "plain-area", "rejected", 48],
  ["Reject B", "easy-angle", "rejected", 42],
].map(([title, fingerprint, status, score]) => ({
  title, fingerprint, status, score,
  hiddenInsight: "A compact hidden relationship.",
  reason: "Independent review outcome.",
  solution: ["Use the relationship."],
}));
const challenge = {
  prompt: "Which value completes the diagram?",
  options: ["8", "10", "12", "14", "16"],
  correctAnswer: "12",
  answerType: "multipleChoice",
  hint: "Compare corresponding parts.",
  solutionSteps: ["Find the shared relationship.", "Apply it to the missing part."],
  diagramSvg: svg,
  diagramAlt: "A labelled line diagram.",
  fingerprint: "grid-ratio",
  qualityScore: 88,
  concepts,
  visualReview: { pass: true, mathematicallyFaithful: true, legible: true, issues: [] },
};

test("Vercel route wrappers expose Web Handler fetch methods", async () => {
  assert.equal(typeof generateRoute.fetch, "function");
  assert.equal(typeof healthRoute.fetch, "function");
  const response = await healthRoute.fetch(new Request("https://api.example/api/health"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test("healthier SVG is converted while active content is rejected", () => {
  assert.match(makeDiagramDataUri(svg), /^data:image\/svg\+xml;base64,/);
  assert.throws(() => makeDiagramDataUri(svg.replace("</svg>", "<script>alert(1)</script></svg>")), /unsafe/);
});

test("deterministic quality gates accept a complete challenge", () => {
  assert.doesNotThrow(() => validateChallenge(challenge, "junior", []));
  assert.throws(() => validateChallenge({ ...challenge, options: ["12", "12", "13", "14", "15"] }, "junior", []));
});

test("CORS preflight is handled without calling OpenAI", async () => {
  const request = new Request("https://api.example/api/generate", {
    method: "OPTIONS",
    headers: { origin: "https://stickstuition.com" },
  });
  const response = await handleGenerate(request, {
    env: { PUZZLEFORGE_ALLOWED_ORIGINS: "https://stickstuition.com" },
    fetchImpl: () => assert.fail("OpenAI must not be called"),
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://stickstuition.com");
});

test("unknown browser origins are rejected", async () => {
  const request = new Request("https://api.example/api/generate", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: "{}",
  });
  const response = await handleGenerate(request, {
    env: { OPENAI_API_KEY: "test-only", PUZZLEFORGE_ALLOWED_ORIGINS: "https://stickstuition.com" },
  });
  assert.equal(response.status, 403);
});

test("successful generation preserves the existing frontend contract", async () => {
  const request = new Request("https://api.example/api/generate", {
    method: "POST",
    headers: { origin: "https://stickstuition.com", "content-type": "application/json" },
    body: JSON.stringify({ level: "junior", category: "mixed", recentFingerprints: [] }),
  });
  const fetchImpl = async () => Response.json({
    choices: [{ message: { content: JSON.stringify(challenge) } }],
  });
  const response = await handleGenerate(request, {
    env: { OPENAI_API_KEY: "test-only", PUZZLEFORGE_ALLOWED_ORIGINS: "https://stickstuition.com" },
    fetchImpl,
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.source, "ai");
  assert.equal(body.correctAnswer, "12");
  assert.match(body.diagramDataUri, /^data:image\/svg\+xml;base64,/);
  assert.equal(body.diagramSvg, undefined);
  assert.equal(body.audit.concepts.length, 5);
});
