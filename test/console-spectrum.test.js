/**
 * The spend spectrum's labels keep the type's own proportions.
 *
 * The two bars are a drawing stretched to the pane's width, so anything drawn
 * inside it is stretched with it: a label printed there came out more than
 * twice its width in a wide pane and squeezed on a phone. Held by the page's
 * own renderer, run with plain helpers:
 *
 * - nothing in the stretched drawing is text; each label is laid over its own
 *   segment, in percent of the drawing, so it follows the bars at every
 *   width, and carries its whole on hover;
 * - the ink follows the ramp, reversed on the light theme;
 * - an estimate that is a floor says so in its labels;
 * - the compact frame, which draws the cost bar alone, labels that bar alone;
 * - a window with no estimate leaves no label over the empty drawing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";

const JS = fs.readFileSync(new URL("../public/console.js", import.meta.url), "utf8").replace(/\r\n/gu, "\n");

const esc = (s) => String(s ?? "");
/** One of the page's own functions (a `function name(` block ending at the first "\n  }\n"), run with plain helpers. */
function fn(name, helpers = {}) {
  const start = JS.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `console.js no longer defines ${name}`);
  const end = JS.indexOf("\n  }\n", start);
  const ctx = { esc, ...helpers };
  vm.createContext(ctx);
  vm.runInContext(JS.slice(start, end + 4) + `\nthis.${name} = ${name};`, ctx);
  return ctx[name];
}
const elements = () => {
  const nodes = new Map();
  return (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, innerHTML: "", textContent: "", attrs: {}, classList: { toggle() {} },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; } });
    return nodes.get(id);
  };
};
const text = (html) => String(html).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();

/* A day whose money and whose tokens split differently by class: 25, 40, 5 and 30 % of the estimate, 10, 15, 5 and 70 % of the tokens. */
const WINDOW = {
  tokens: { total: 1000, output: 100, cacheWrite: 150, fresh: 50, cacheRead: 700 },
  cost: { usd: 20, status: "estimated", byClass: { output: 5, cacheWrite: 8, fresh: 1, cacheRead: 6, unsplitUsd: 0 }, unpricedModels: [], unpricedTokens: 0 },
  models: [],
};

/** The page's own paintSpectrum over one window, and the elements it paints. */
function painter({ window = WINDOW, compact = false, theme = "dark" } = {}) {
  const $ = elements();
  const paintSpectrum = fn("paintSpectrum", { $, D: { devices: [{ id: "d1" }] }, win: () => window, period: "24h", PERIOD_TEXT: { "24h": ["last 24 hours", "24 h"] },
    CLASSES: ["cacheRead", "fresh", "cacheWrite", "output"], ORDER: ["output", "cacheWrite", "fresh", "cacheRead"],
    CLASS_LABEL: { cacheRead: "cache read", cacheWrite: "cache write", output: "output", fresh: "uncached input" },
    money: (n) => "$" + n.toFixed(2), fmt: (n) => String(n), pct: (share, digits = 1) => (share * 100).toFixed(digits) + "%",
    compactMQ: { matches: compact }, currentTheme: () => theme, quietWindow: () => false, quietReason: () => "", specModelRows: () => "", floorLine: () => "" });
  return { $, paintSpectrum };
}

/** The labels laid over the bars: where each sits, in percent of the drawing, its ink, what it reads and what it says on hover. */
function labels(html) {
  return String(html).split('<span class="slabel ').slice(1).map((chunk) => {
    const at = (side) => Number(new RegExp(`[";]${side}:([\\d.]+)%`, "u").exec(chunk)[1]);
    return { left: at("left"), top: at("top"), width: at("width"), height: at("height"), ink: chunk.slice(0, chunk.indexOf('"')),
      text: text(chunk.slice(chunk.indexOf(">") + 1)), title: /title="([^"]*)"/u.exec(chunk)[1] };
  });
}

test("each label is laid over its own segment, in percent of the drawing, and nothing in the stretched drawing is text", () => {
  const { $, paintSpectrum } = painter();
  paintSpectrum();
  assert.equal($("cSpec").getAttribute("viewBox"), "0 0 520 60");
  assert.doesNotMatch($("cSpec").innerHTML, /<text\b/u, "the drawing is stretched to the pane, so text inside it is stretched with it");
  assert.deepEqual(labels($("specLabels").innerHTML), [
    // the cost bar, 2–24 of the drawing's 60: a segment under 12 % of the bar (input, 5 %) carries no label
    { left: 0, top: 3.33, width: 25, height: 36.67, ink: "onlight", text: "output · $5.00 est.", title: "output · $5.00 est." },
    { left: 25, top: 3.33, width: 40, height: 36.67, ink: "onlight", text: "cache write · $8.00 est.", title: "cache write · $8.00 est." },
    { left: 70, top: 3.33, width: 30, height: 36.67, ink: "ondark", text: "cache read · $6.00 est.", title: "cache read · $6.00 est." },
    // the token bar, 36–58 of 60: output (10 %) and input (5 %) carry none
    { left: 10, top: 60, width: 15, height: 36.67, ink: "onlight", text: "cache write · 150", title: "cache write · 150" },
    { left: 30, top: 60, width: 70, height: 36.67, ink: "ondark", text: "cache read · 700", title: "cache read · 700" },
  ]);
});

test("the labels' ink follows the ramp, reversed on the light theme", () => {
  const { $, paintSpectrum } = painter({ theme: "light" });
  paintSpectrum();
  assert.deepEqual(labels($("specLabels").innerHTML).map((l) => [l.text, l.ink]), [
    ["output · $5.00 est.", "ondark"], ["cache write · $8.00 est.", "ondark"], ["cache read · $6.00 est.", "onlight"],
    ["cache write · 150", "ondark"], ["cache read · 700", "onlight"],
  ]);
});

test("an estimate that is a floor says so in its labels", () => {
  const { $, paintSpectrum } = painter({ window: { ...WINDOW, cost: { ...WINDOW.cost, status: "partial", unpricedModels: ["some-unlisted-model"], unpricedTokens: 40 } } });
  paintSpectrum();
  assert.deepEqual(labels($("specLabels").innerHTML).slice(0, 3).map((l) => [l.text, l.title]), [
    ["output · $5.00+ est.", "output · $5.00+ est."], ["cache write · $8.00+ est.", "cache write · $8.00+ est."], ["cache read · $6.00+ est.", "cache read · $6.00+ est."],
  ]);
});

test("the compact frame draws the cost bar alone, and labels it alone", () => {
  const { $, paintSpectrum } = painter({ compact: true });
  paintSpectrum();
  assert.equal($("cSpec").getAttribute("viewBox"), "0 0 520 24");
  assert.doesNotMatch($("cSpec").innerHTML, /<text\b/u);
  // the one bar, 2–24 of the drawing's 24
  assert.deepEqual(labels($("specLabels").innerHTML).map(({ left, top, width, height, text: reads }) => ({ left, top, width, height, reads })), [
    { left: 0, top: 8.33, width: 25, height: 91.67, reads: "output · $5.00 est." },
    { left: 25, top: 8.33, width: 40, height: 91.67, reads: "cache write · $8.00 est." },
    { left: 70, top: 8.33, width: 30, height: 91.67, reads: "cache read · $6.00 est." },
  ]);
});

test("a window with no estimate leaves no label over the empty drawing", () => {
  const { $, paintSpectrum } = painter({ window: { ...WINDOW, cost: { usd: null, status: "none", byClass: null, unpricedModels: [], unpricedTokens: 0 } } });
  $("specLabels").innerHTML = "the labels of the period shown before";
  paintSpectrum();
  assert.equal($("cSpec").innerHTML, "");
  assert.equal($("specLabels").innerHTML, "");
});
