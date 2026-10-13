# Testing, release and verification

## Contents
1. Unit tests for the registry
2. Guard tests
3. Gateway tests
4. Component test with a fake modelContext
5. Integration tests (real database)
6. Browser proof (Playwright)
7. Smoke checks after deploy
8. Origin-trial tokens on Vercel
9. Post-release checks
10. Documentation to leave behind

## 1. Registry (Vitest)
- Every tool: non-empty English description, `title`, snake_case unique `name`, JSON Schema object with `properties`, at least one valid example input parsing.
- Every tool `readOnlyHint: true` (writes are forms); none with `consequentialHint`.
- `toolMetadata()` contains no functions (`JSON.parse(JSON.stringify(x))` deep-equals `x`).
- `inputFromQuery`: string fields stay strings (`"2026"`), numbers/booleans parsed, garbage stays string and fails Zod.

## 2. Guards (static, read the source tree)
- `registerTool` appears only in the client component.
- `app/api/agents/` contains exactly one `route.ts` (the gateway).
- `toolname=` appears only in approved form files; the registration form has no `tool*` attributes.
- Existing project guards stay green (access-rule centralisation, legal-page exclusion in every list query, PII, localisation of messages). Add the new gateway to lists of public routes those guards enumerate.

## 3. Gateway (mock the registry deps like other route tests)
404 unknown · 405 on POST with `Allow: GET` · 400 with `fields` · 429 with `Retry-After` · 200 `{ ok, data }` · 500 generic on throw · headers `no-store` + `noindex` · session failure → guest.

## 4. Component (jsdom)
Install a fake `document.modelContext = { registerTool: vi.fn(async (tool, { signal }) => …) }`; render; expect N registrations with the metadata; call `execute` → `fetch` mocked → MCP-shaped text; error body → `isError`; unmount → signal aborted; locale change → abort + re-register; no `modelContext` → nothing happens; duplicate-name rejection swallowed.

## 5. Integration (real Postgres, local only)
Seed: public, gated, draft, trashed, legal posts; published/unpublished course; a certificate. Assert per tool what a guest vs an entitled user sees; fake certificate code → invalid; `llms.txt` contains all content types and the Agent tools section. Prove the test can fail: remove the access filter temporarily, see reds, restore.

## 6. Browser proof (Playwright on `next build && next start`)
- Chromium without WebMCP: no errors, nothing registered.
- `page.addInitScript` with a fake `document.modelContext` that records registrations: expected tool names; call one `execute` from the page → real gateway → data.
- Declarative forms: attributes present in served HTML (`curl` the page).
- If the site has a CSP: zero `securitypolicyviolation` events on the main pages.
- Use `scripts/probe-webmcp.mjs` for a quick check (works against production too).
- Real Chrome: `chrome://flags/#enable-webmcp-testing` + the "Model Context Tool Inspector" extension.

## 7. Smoke checks after deploy
Add to the project's smoke script: `GET /api/agents/<a read tool>` → 200 JSON `ok:true`; `GET /api/agents/search_content?query=…` → 200; `llms.txt` contains "Agent tools". Update any documented check count.

## 8. Origin-trial tokens on Vercel
1. Register the origin (exact `https://example.com`) in Chrome's Origin Trials console ("WebMCP", from Chrome 149) and, optionally, Microsoft Edge's (from 150).
2. Vercel → Project → Settings → Environment Variables: `WEBMCP_ORIGIN_TRIAL_TOKEN` (and `_EDGE`), **Production only** (preview URLs are other origins). The token is public; "Sensitive" is optional.
3. Redeploy (env changes apply to new deployments only), or set before the release deploy.
4. Verify: `view-source:` the home, search `origin-trial`.
5. Record the expiry date in the project status doc and schedule a reminder ~1 month before (renew in the console, update the env var, redeploy). When WebMCP ships unflagged, tokens become unnecessary.

## 9. Post-release
- Smoke green; `llms.txt` updated.
- `node scripts/probe-webmcp.mjs https://example.com/` (from a machine that can reach the site).
- Lighthouse → Agentic browsing (Chrome 150+): tools listed, schemas valid, forms check (excluded forms expected).
- Real agent session: "What's on this site about X?" (search + read), "Subscribe me to the newsletter" (fills the form, leaves submit to the person).
- PageSpeed Best Practices: no new console errors.

## 10. Leave behind
- Architecture doc section: registry location, gateway, component, forms, what is excluded and why, how to add a tool, origin trial and expiry, that crawlers don't read WebMCP.
- A row in the project's "single source of truth" index (if it has one) pointing to the registry and its guard test.
- A delivery note with sources and the date the spec was read, plus the choices to confirm (English descriptions, no polyfill, excluded forms).
