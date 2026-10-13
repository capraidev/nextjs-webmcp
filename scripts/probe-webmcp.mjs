#!/usr/bin/env node
/**
 * probe-webmcp.mjs — what WebMCP tools does a page expose?
 *
 *   node probe-webmcp.mjs <url> [--call <tool> '<json input>'] [--json]
 *
 * Opens the page in Chromium (Playwright), injects a fake `document.modelContext`
 * BEFORE any page script runs, and reports:
 *   - imperative tools registered with registerTool (name, title, annotations,
 *     input schema properties), and whether any registration failed;
 *   - declarative form tools (<form toolname>), their fields and whether
 *     toolautosubmit is set;
 *   - forms WITHOUT toolname (what Lighthouse "Forms missing declarative WebMCP" lists);
 *   - origin-trial meta tags present;
 *   - console errors and CSP violations seen while loading.
 * With --call it executes one registered tool in the page and prints the result.
 *
 * Requires the `playwright` package (global or local). If the browser binary is
 * pre-installed elsewhere, set PW_CHROMIUM=/path/to/chromium.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of ["playwright", "@playwright/test"]) {
    try {
      return require(id);
    } catch {}
  }
  for (const p of ["/opt/node22/lib/node_modules/playwright", "/usr/lib/node_modules/playwright"]) {
    try {
      return require(p);
    } catch {}
  }
  console.error("playwright not found: npm i -D playwright (or set NODE_PATH)");
  process.exit(2);
}

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error("usage: node probe-webmcp.mjs <url> [--call <tool> '<json>'] [--json]");
  process.exit(2);
}
const callIdx = args.indexOf("--call");
const callName = callIdx >= 0 ? args[callIdx + 1] : null;
const callInput = callIdx >= 0 && args[callIdx + 2] ? JSON.parse(args[callIdx + 2]) : {};
const asJson = args.includes("--json");

const { chromium } = loadPlaywright();
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  const registered = [];
  const failures = [];
  const fake = {
    registerTool(tool, options = {}) {
      if (registered.some((t) => t.name === tool.name && !t.aborted)) {
        failures.push(`duplicate: ${tool.name}`);
        return Promise.reject(new DOMException("duplicate tool name", "InvalidStateError"));
      }
      const entry = { ...tool, aborted: false };
      registered.push(entry);
      options.signal?.addEventListener("abort", () => (entry.aborted = true));
      return Promise.resolve();
    },
  };
  Object.defineProperty(Document.prototype, "modelContext", { configurable: true, get: () => fake });
  window.__webmcp = { registered, failures };
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) =>
    window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`)
  );
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const report = await page.evaluate(() => {
  const tools = window.__webmcp.registered
    .filter((t) => !t.aborted)
    .map((t) => ({
      name: t.name,
      title: t.title ?? null,
      annotations: t.annotations ?? {},
      params: Object.keys(t.inputSchema?.properties ?? {}),
      required: t.inputSchema?.required ?? [],
    }));
  const forms = [...document.querySelectorAll("form")];
  const declarative = forms
    .filter((f) => f.hasAttribute("toolname"))
    .map((f) => ({
      toolname: f.getAttribute("toolname"),
      hasDescription: !!f.getAttribute("tooldescription"),
      autosubmit: f.hasAttribute("toolautosubmit"),
      fields: [...f.querySelectorAll("[name]")].map((el) => ({
        name: el.getAttribute("name"),
        described: el.hasAttribute("toolparamdescription"),
      })),
    }));
  const undeclared = forms
    .filter((f) => !f.hasAttribute("toolname"))
    .map((f) => f.id || f.getAttribute("aria-label") || f.getAttribute("action") || "(anonymous form)");
  const originTrials = [...document.querySelectorAll('meta[http-equiv="origin-trial" i]')].length;
  return { tools, failures: window.__webmcp.failures, declarative, undeclared, originTrials, csp: window.__csp };
});

let callResult = null;
if (callName) {
  callResult = await page.evaluate(
    async ({ name, input }) => {
      const t = window.__webmcp.registered.find((x) => x.name === name && !x.aborted);
      if (!t) return { error: `tool not registered: ${name}` };
      try {
        return await t.execute(input, { signal: new AbortController().signal });
      } catch (e) {
        return { thrown: String(e) };
      }
    },
    { name: callName, input: callInput }
  );
}

await browser.close();
const out = { url, ...report, consoleErrors, call: callResult };
if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`\nWebMCP probe — ${url}`);
  console.log(`origin-trial meta tags: ${report.originTrials}`);
  console.log(`\nImperative tools (${report.tools.length}):`);
  for (const t of report.tools) {
    const ann = Object.entries(t.annotations).filter(([, v]) => v).map(([k]) => k).join(", ") || "no annotations";
    console.log(`  - ${t.name}  [${ann}]  params: ${t.params.join(", ") || "none"}`);
  }
  if (report.failures.length) console.log(`  registration failures: ${report.failures.join("; ")}`);
  console.log(`\nDeclarative forms (${report.declarative.length}):`);
  for (const f of report.declarative) {
    const undescribed = f.fields.filter((x) => !x.described).map((x) => x.name);
    console.log(
      `  - ${f.toolname}${f.hasDescription ? "" : "  ⚠ no tooldescription"}${f.autosubmit ? "  ⚠ toolautosubmit" : ""}` +
        `  fields: ${f.fields.map((x) => x.name).join(", ")}` +
        (undescribed.length ? `  ⚠ undescribed: ${undescribed.join(", ")}` : "")
    );
  }
  if (report.undeclared.length) console.log(`\nForms without toolname: ${report.undeclared.join(", ")}`);
  if (report.csp.length) console.log(`\nCSP violations: ${report.csp.join("; ")}`);
  if (consoleErrors.length) console.log(`\nConsole errors:\n  ${consoleErrors.join("\n  ")}`);
  if (callResult) console.log(`\nCall ${callName}:\n${JSON.stringify(callResult, null, 2).slice(0, 4000)}`);
  if (report.tools.length > 40) console.log("\n⚠ more than 40 tools: Lighthouse will warn.");
}
