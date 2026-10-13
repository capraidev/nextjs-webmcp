---
name: nextjs-webmcp
description: Plan and implement a WebMCP "server" (browser-side tools via document.modelContext, plus declarative form tools) on a Next.js App Router site, so that AI agents working in the browser can search, read and act on the site through declared tools instead of scraping HTML. Covers the single tool registry, the GET gateway route, the client registration component, declarative forms, origin-trial tokens, llms.txt, security (gating, rate limits, PII, CSP/Trusted Types), tests and release checks. Use this skill whenever the user mentions WebMCP, navigator.modelContext or document.modelContext, registerTool, "agent-ready" or "agentic" website, tools for AI agents or LLMs on a website, toolname/tooldescription form attributes, Lighthouse "Agentic browsing" audits, or wants to make a Next.js site machine-actionable for GEO/AI SEO — even if they only say "make my site usable by AI agents" or "add MCP to my website frontend".
---

# WebMCP on a Next.js site

WebMCP lets a web page declare **tools** that an AI agent running *inside the browser* can call (Gemini in Chrome, ChatGPT Desktop, browser extensions). The page registers them with `document.modelContext.registerTool(...)` (imperative API) or by annotating `<form>` elements (declarative API). This skill distils a real production implementation on a Next.js 16 / React 19 site into a repeatable plan.

Read this file fully, then open only the reference you need:

| File | Read it when |
|---|---|
| `references/webmcp-api.md` | You need the exact API shape, browser support, origin trial, Lighthouse audits, or you must re-verify the spec (always do that first, see below) |
| `references/architecture.md` | You are building the registry, the gateway route and the client component — includes full code walkthrough |
| `references/declarative-forms.md` | You are turning forms (newsletter, contact…) into tools |
| `references/security.md` | Always before shipping: access rules, PII, rate limits, CSP / nonce / Trusted Types / COOP interplay |
| `references/testing-and-release.md` | Writing tests, guard tests, browser proof, smoke checks, origin-trial tokens on Vercel, post-release checks |
| `assets/templates/` | Copy-and-adapt TypeScript templates for every piece |
| `scripts/probe-webmcp.mjs` | Verify a running site (local or production): lists the tools a page registers and the declarative forms, and can call a tool |

## First: re-verify the spec

WebMCP is a W3C Community Group **draft** and moves month to month. In 2026 alone the getter moved from `navigator.modelContext` to `document.modelContext`, `provideContext()`/`clearContext()`/`unregisterTool()` disappeared, and polyfill packages shipped breaking majors every few months. Before writing code, re-read the current draft (`github.com/webmachinelearning/webmcp`, `index.bs`, `implementation-status.md`, `declarative-api-explainer.md`) and Chrome's guides (`developer.chrome.com/docs/ai/webmcp` and its `imperative-api`, `declarative-api`, `best-practices`, `secure-tools` pages). If the sandbox blocks developer.chrome.com, use web search restricted to that domain; GitHub raw files are usually reachable. Compare what you find with `references/webmcp-api.md` and trust the newer source. Tell the user which version of the facts you used.

## Set expectations honestly (GEO)

WebMCP tools exist only in an open tab with an agent. **No crawler reads them** — GPTBot, ClaudeBot, Google's crawlers don't execute tools. So WebMCP is not "SEO" by itself: it makes the site *actionable* for in-browser agents. Pair it with what crawlers do read: complete `llms.txt` / `llms-full.txt` (every public content type, not just posts), clean sitemap, JSON-LD. The same registry that feeds WebMCP should feed `llms.txt` (an "Agent tools" section) and, later, an optional remote MCP endpoint. Say this to the user up front; it shapes the scope.

## The architecture in one picture

```
lib/agents/tools.ts      ← ONE registry (server-only): name, title, description,
                           Zod input, annotations, rate limit, execute()
   │        │                     │
   │        │                     └→ llms.txt "Agent tools" section (+ future remote MCP)
   │        └→ app/api/agents/[name]/route.ts   GET gateway: lookup, rate-limit,
   │                                            validate, viewer from cookies, execute
   └→ toolMetadata() (no functions) ─→ <AgentTools> client component in the public
                                       layout: feature-detect, registerTool(...) with
                                       execute = fetch(gateway), AbortController
lib/agents/forms.ts      ← declarative form tools (toolname / tooldescription /
                           toolparamdescription) used by the real site forms
```

Why this shape:
- **One registry, many surfaces.** Descriptions, schemas and access rules live once; the browser gets only metadata, never server functions. A guard test keeps it single (see testing reference).
- **Execution stays on the server.** The client `execute` is a `fetch` to a same-origin GET route, so access rules, rate limits and data shaping run where they already run for pages. The browser cookies make the tool see exactly what the person would see.
- **Read tools imperative, consequential actions declarative.** Chrome's guidance: no overlapping tools, and actions with consequences stay in visible UI. So reading/searching = registry tools (`readOnlyHint: true`, GET only); "subscribe", "send message" = the site's own forms annotated declaratively, without `toolautosubmit`: the agent fills the form, **the person presses submit** — that is the confirmation.

## Workflow

1. **Survey the site** (use an Explore subagent on bigger repos): public routes, existing machine-readable surface (llms.txt, sitemap, robots, JSON-LD), public read functions in `lib/data`, how access/gating is decided (find the *one* function — reuse it, never re-implement), public actions that work without login (and their rate limits), the root and public layouts, CSP and middleware, i18n. Note what has no public read function yet: you may need to extract one from a page (DRY: the page and the tool must then share it).
2. **Choose the tools with the user.** Aim for a handful (Lighthouse warns above 40; agents pay tokens per tool). Typical content/education site: `search_content`, `list_articles`, `get_article`, `list_courses` (or products), `get_course`, `verify_certificate`. Declarative forms: `subscribe_newsletter`, `send_contact_message`. **Leave out on purpose**: payments, checkout, enrolment, registration/consent, invitations, anything admin — they need login, consent or money, which must stay a human act; instead return the page URL and the next step (`viewer.nextStep: "register" | "buy" | …`). Record these as explicit choices for the user to confirm.
3. **Write the registry** (`assets/templates/tools.ts`): English snake_case names, English titles/descriptions written for a model ("what it does, when to use it, what it never does"), `.describe()` on every Zod field, a `language` field when the site is multilingual, absolute URLs in results, a per-tool rate limit. Generate JSON Schema with Zod 4 `z.toJSONSchema(schema, { io: "input" })` and drop `$schema`.
4. **Write the gateway route** (`assets/templates/route.ts`): GET only (405 with `Allow: GET` on POST), 404 unknown tool, rate limit **before** validation, 400 with field errors the agent can fix, viewer from cookies (expired session = guest), `Cache-Control: no-store`, `X-Robots-Tag: noindex`, generic 500 with details only in logs. Messages in the reader's language if the site localises errors. Query strings only carry strings: coerce non-string fields by reading the tool's JSON Schema (`inputFromQuery`).
5. **Write the client component** (`assets/templates/agent-tools.tsx`) and mount it **once** in the public layout (not admin). Types in `assets/templates/webmcp.d.ts` — hand-written from the draft IDL, no polyfill dependency.
6. **Declarative forms** (`references/declarative-forms.md`).
7. **Origin trial + llms.txt** (`references/testing-and-release.md`).
8. **Tests, guards, browser proof, docs**, then release with the user's go.

## Lessons that cost time (read before coding)

- **`document.modelContext ?? navigator.modelContext`**, and do nothing when absent (Firefox, Safari, Chrome without trial/flag): zero cost for normal visitors.
- **Unregister with an `AbortController`** passed as `{ signal }`; there is no `unregisterTool`. Abort on unmount and on locale change. The public layout does not remount on client navigation, so tools stay registered while browsing — that's desired.
- **`registerTool` returns a Promise and rejects on duplicate names** (e.g. React Strict Mode double effects, or two tabs of the same component). Catch both the sync throw and the rejection; log only in development.
- **Return MCP-shaped results**: `{ content: [{ type: "text", text: JSON.stringify(data) }] }`, and `isError: true` with a readable message instead of throwing — agents recover from text, not from exceptions.
- **`/api` routes usually bypass the i18n middleware**: send the page language in a header from the client so gateway messages and content follow the page.
- **Controlled React inputs and declarative forms**: the browser may set `input.value` for the agent without firing `input` events, so `useState` stays empty. Read values with `new FormData(event.currentTarget)` at submit (fallback to state).
- **`respondWith` must settle**: if the server action throws, reject the promise you gave to `SubmitEvent.respondWith`, otherwise the agent waits until its timeout.
- **TypeScript rejects `toolname` etc. on JSX**: augment `react`'s `FormHTMLAttributes` / `InputHTMLAttributes` / `TextareaHTMLAttributes` (template provided). React 19 passes unknown lowercase string attributes to the DOM.
- **Origin trial token in `<head>`** via `<meta httpEquiv="origin-trial" content=…>` rendered only when the env var is set; set it for **Production only** on Vercel (preview domains differ), redeploy, record the expiry date and schedule a reminder a month before.
- **Not for crawlers**: keep `/api/agents/*` disallowed in `robots.txt` (usually `/api/` already is) and `noindex`.
- **Lighthouse "Agentic browsing"** (Chrome 150+): "Registered WebMCP tools", "WebMCP schema validity", "Forms missing declarative WebMCP". A form left without attributes on purpose (registration/consent) will be flagged: document the choice rather than "fix" it.
- **Strict CSP / Trusted Types** don't break WebMCP code itself (no DOM sinks, same-origin fetch covered by `connect-src 'self'`). But if you later add Trusted Types, remember error-shell pages and server-rendered inline scripts (see security reference) — the same release introduced a console error that cost Best Practices points elsewhere.

## Deliverables checklist

- [ ] Registry + metadata function + gateway + client component + types
- [ ] Declarative attributes on the chosen forms (+ FormData read, `respondWith`)
- [ ] Origin-trial meta tag(s) behind env vars, documented in `.env.example`
- [ ] `llms.txt` lists all public content types and an "Agent tools" section from the registry
- [ ] Unit tests (registry invariants), guard test (single registry, single gateway, `toolname` only on approved forms), gateway tests (404/405/400/429/200), component test with a fake `modelContext`, integration tests for access rules, a browser proof, smoke checks
- [ ] Docs: where the registry lives, what is excluded and why, how to add a tool
- [ ] After release: run `scripts/probe-webmcp.mjs` against production, Lighthouse Agentic browsing, a real agent session ("which courses are on this site?", "subscribe me to the newsletter" → must fill the form and leave submit to the person)

## Adding a tool later (tell the user this recipe)

1. Add an entry to the registry (name, title, description, Zod input with `.describe()`, annotations, limit, `execute` reusing an existing read function).
2. If it changes data, it does not belong in the registry: make it a declarative form or keep it human.
3. Run the registry tests and the guard; add a gateway/integration case.
4. `llms.txt` updates itself from the registry.
