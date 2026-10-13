# Architecture walkthrough

Templates: `assets/templates/` (`tools.ts`, `route.ts`, `agent-tools.tsx`, `webmcp.d.ts`, `forms.ts`, `origin-trial-and-llms.tsx`). Rename paths to the project's conventions (and its language for identifiers/comments — match the codebase).

## 1. Survey before writing

Questions to answer from the code, not from assumptions:

| Question | Why it matters |
|---|---|
| Where is "can this visitor see X?" decided (one function / one Prisma `where`)? | Tools must call it, never re-implement it. A duplicated rule once published reserved content to `llms-full.txt` on the reference project. |
| Is there a public read function per content type, or does each page query the ORM inline? | If inline, extract a shared function first (page and tool use it). Typical: search logic living inside `app/api/search/route.ts` → move to `lib/data/search.ts`. |
| Which content must never appear (drafts, trash, legal pages, unpublished products)? | Filters go in the shared function, tested in integration. |
| How are absolute URLs and alternate-language URLs built? | Results must carry canonical absolute URLs from the same helper as `<link rel="canonical">`. |
| Is there a shared, cross-instance rate limiter (DB/Redis)? | In-memory limiters don't work across serverless instances. |
| How does the app resolve language? Does the middleware cover `/api`? | Usually not → send a header from the client. |
| What does the CSP allow in `connect-src`? Is there a nonce / Trusted Types? | Same-origin fetch is fine under `'self'`; see `security.md`. |
| Which forms exist publicly, and what do they do server-side? | Candidates for the declarative API; check rate limits and double opt-in. |

## 2. The registry (`lib/agents/tools.ts`)

- `server-only`. Holds `TOOLS: Tool[]`, `toolByName`, `jsonSchemaOf`, `toolMetadata()`, `inputFromQuery`.
- One Zod schema per tool, fields `.describe()`d for the model; JSON Schema via Zod 4 `z.toJSONSchema(schema, { io: "input" })` (so defaulted fields are optional), drop `$schema`.
- If the project has a guard that forbids prose inside public validation schemas (because they are user-facing error messages), keep tool schemas in the registry rather than `lib/validations/`: their `.describe()` strings are for the model. Real validation errors still go through the project's localised field-error formatter.
- `execute(input, { viewer, locale })` returns `{ ok: true, data }` or `{ ok: false, error, fields?, status }` — refusals the agent can read and correct.
- Shape results for a model: compact, absolute URLs, ISO dates or site-timezone formatted dates, prices in minor units with currency and VAT note, `available: false, reason: "restricted"` with title + public description for gated content (never the body), `viewer.nextStep` for courses/products (`open`, `register`, `enroll`, `buy`) plus the page URL — the human completes it.
- Markdown body for articles: reuse the function that renders the site's markdown/plain view, so `get_article` and `llms-full.txt` share it.

### Tool design rules (from Chrome's best practices and production)
- Few tools, one job each, no overlap. Precise verbs: `get_course` (returns now) vs `start_checkout` (we don't do that).
- Descriptions say what, when, and what not ("Enrolling and paying are done by the person on the course page; this tool never does them").
- Accept raw user input and normalise in code (trim, accept a full URL **or** a slug or a path). Keep schemas loose, validate strictly in `execute`.
- Readable enum values; a `language` field for multilingual sites.
- Respect limits in schema (`max(20)`) and enforce in code.

## 3. The gateway (`app/api/agents/[name]/route.ts`)

Order matters: lookup → **rate limit** → validate → viewer → execute.
- GET only; POST → 405 + `Allow: GET` with a readable body.
- `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `Cache-Control: no-store` (answers depend on the viewer), `X-Robots-Tag: noindex`.
- Errors in the reader's language if the site localises (`messages.agents.unknownTool`, `.methodNotAllowed`, `.error`), added to every dictionary.
- If the project has tests that enumerate public routes for localisation or guard coverage, register the new route there.
- One gateway only — a guard test asserts `app/api/agents/` contains a single route.

## 4. The client (`components/…/agent-tools.tsx`)

- Server layout calls `toolMetadata()` and passes plain data as props. Never import the registry into a client file (it is `server-only`, and functions don't serialise).
- Mount in the **public** layout next to other once-per-page client helpers (document-lang, cookie banner). Not in admin/user areas unless you deliberately design tools for them.
- `useEffect` with `[tools, locale]`: feature-detect, register with one `AbortController`, abort on cleanup.
- `execute` → GET with the input in the query (non-strings JSON-encoded), language header, `credentials: "same-origin"`, the agent's `signal`. Return MCP-shaped text; failures as `isError` text.
- Renders `null`: zero visual and SEO impact.

## 5. Remote MCP endpoint (optional, separate decision)

The registry is designed so that a Streamable-HTTP MCP endpoint (`app/mcp/route.ts`) can expose the same read-only tools to desktop clients without a browser. It is a new always-open public surface (needs its own rate limits, maybe auth for non-public data, an SDK dependency): propose it as a separate item for the owner to decide, don't ship it implicitly.
