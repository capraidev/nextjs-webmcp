# nextjs-webmcp

A Claude skill for planning and implementing **WebMCP** on a **Next.js (App Router)** website: browser-side tools registered with `document.modelContext`, plus declarative form tools, so that AI agents working inside the browser (Gemini in Chrome, ChatGPT Desktop, browser extensions) can search, read and act on the site through declared tools instead of scraping HTML.

It is distilled from a production implementation on caprai.dev (Next.js 16, React 19, Zod 4, Vercel, October 2026), including the mistakes that cost time.

> This README is for people. Claude reads `SKILL.md`, which is the entry point of the skill.

## What you get

- A **workflow** in eight steps, from surveying the codebase to releasing and verifying in production.
- An **architecture**: one tool registry → a GET gateway route → a client component that registers the tools, plus the site's own forms annotated with the declarative API. The same registry feeds `llms.txt` and, optionally later, a remote MCP endpoint.
- **Copy-and-adapt templates** in TypeScript for every piece.
- **Security guidance**: reusing access rules, rate limits, personal data, prompt injection, and how WebMCP interacts with a nonce-based CSP, Trusted Types and COOP.
- A **testing and release plan**: unit tests, guard tests, gateway tests, a component test with a fake `modelContext`, integration tests, browser proof, smoke checks, origin-trial tokens on Vercel with expiry reminders, Lighthouse "Agentic browsing".
- A **probe script** that lists the tools and declarative forms a live page exposes and can call a tool.

## Structure

```
nextjs-webmcp/
├── README.md                          this file (for humans)
├── SKILL.md                           entry point for Claude: workflow, architecture, lessons, checklist
├── references/
│   ├── webmcp-api.md                  API snapshot (Oct 2026), removed APIs, browser support,
│   │                                  origin trial, Lighthouse audits, how to re-verify the spec
│   ├── architecture.md                survey questions, registry, gateway, client, remote MCP option
│   ├── declarative-forms.md           which forms, how, React pitfalls, tests
│   ├── security.md                    access, PII, rate limits, prompt injection, CSP/Trusted Types/COOP
│   └── testing-and-release.md         tests, browser proof, smoke checks, Vercel tokens, post-release
├── assets/templates/
│   ├── webmcp.d.ts                    hand-written types from the draft IDL (+ JSX attribute augmentation)
│   ├── tools.ts                       the single registry (Zod → JSON Schema, metadata, query parsing)
│   ├── route.ts                       app/api/agents/[name]/route.ts — the GET gateway
│   ├── agent-tools.tsx                client component: feature detection, registerTool, AbortController
│   ├── forms.ts                       declarative form constants + agentResponder (respondWith)
│   └── origin-trial-and-llms.tsx      origin-trial <meta> tags and the llms.txt "Agent tools" section
└── scripts/
    └── probe-webmcp.mjs               inspect a running page with Playwright
```

## Installing

- **Claude.ai / Claude Desktop**: open the `.skill` file and press **Save skill**, or upload the folder in Settings → Capabilities → Skills.
- **Claude Code**: copy the `nextjs-webmcp/` folder into `~/.claude/skills/` (personal) or `.claude/skills/` inside a project.

Once installed, the skill triggers by itself when you ask things like "make my Next.js site usable by AI agents", "add WebMCP tools", "Lighthouse says forms are missing declarative WebMCP".

## Using the probe script

Requires Node 18+ and Playwright (`npm i -D playwright` and `npx playwright install chromium`, or point `PW_CHROMIUM` to an existing Chromium).

```bash
node scripts/probe-webmcp.mjs https://example.com/
node scripts/probe-webmcp.mjs https://example.com/ --call search_content '{"query":"ai"}'
node scripts/probe-webmcp.mjs http://localhost:3000/ --json
```

It injects a fake `document.modelContext` before the page loads, so it works in any Chromium without flags or origin-trial tokens. It reports:
- the imperative tools and their annotations;
- the declarative forms;
- the forms without `toolname`;
- the origin-trial meta tags;
- CSP violations and console errors.

## Important caveats

- **WebMCP is a W3C Community Group draft** and changes quickly. In 2026 the getter moved from `navigator` to `document`, and several methods were removed. The skill tells Claude to re-verify the spec before coding. Do the same if you read the references by hand.
- **Crawlers don't read WebMCP.** It makes a site actionable for in-browser agents; it is not SEO by itself. Pair it with a complete `llms.txt`, a sitemap and JSON-LD.
- **Chrome needs an origin-trial token** for real visitors (from Chrome 149; Edge from 150), until the feature ships. Tokens expire: put the date in your calendar.
- **Some actions stay with the person, on purpose.** Payments, registration with consent and other consequential actions are left out deliberately. Lighthouse will flag the excluded forms; that is expected.

## Versions

- 1.0 (13 October 2026): first release. 

## Author

- Alessandro Caprai -> https//caprai.dev 