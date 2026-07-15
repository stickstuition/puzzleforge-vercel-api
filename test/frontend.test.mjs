import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../public/", import.meta.url);

test("standalone frontend has no dependency on the old GameLab interface", async () => {
  const [html, css, js] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.css", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
  ]);
  assert.doesNotMatch(html, /stickstuition\.com\/(styles\.css|site\.js|games\/puzzleforge)/);
  assert.doesNotMatch(html, /pf-hero|pf-forge-controls|data-pf-/);
  assert.match(html, /A picture[\s\S]*One hidden idea/);
  assert.match(html, /8 candidates · 3 finalists · 1 question/);
  assert.match(css, /--lime: #d9f36a/);
  assert.match(css, /\.answer-option span[\s\S]*color: var\(--ink\)/);
  assert.match(js, /fetch\("\/api\/generate"/);
  assert.match(js, /fetch\("\/api\/health"/);
});

test("new frontend includes every interactive screen", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const screen of ["setup", "loading", "result"]) assert.match(html, new RegExp(`data-screen="${screen}"`));
  for (const action of ["forge", "cancel", "another", "review", "hint", "solution"]) assert.match(html, new RegExp(`data-action="${action}"`));
});
