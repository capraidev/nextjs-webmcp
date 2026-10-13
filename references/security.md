# Security checklist

WebMCP makes the site *more* callable. Every tool is a public endpoint reachable by anyone (the gateway is plain GET), plus an LLM-facing surface (prompt injection both ways).

## Access and data
- **Reuse the site's access rules** (visibility filters, gating, published/not-trashed, legal-page exclusion). Write integration tests: a gated item is invisible to a guest and visible to the entitled role; drafts, trash and excluded pages never appear; unpublished products don't exist.
- **Viewer from same-origin cookies**; an exception while reading the session degrades to guest, never to an error that leaks details.
- **No personal data** in results: no names/emails of other people, no internal ids that map to people, no tokens. Certificate verification returns valid/invalid + course + date, never the holder.
- Media/video ids or download links of content the viewer can't open must not leak through tool output (check lesson/product payloads).
- **Rate limit per IP per tool** with a shared store, before validation. Keep the existing limits on form actions.
- `robots.txt` disallows `/api/`; responses carry `X-Robots-Tag: noindex` and `Cache-Control: no-store`.
- Generic 500 to the caller, details to logs only.

## Prompt-injection hygiene
- `untrustedContentHint: true` on any tool returning text written by third parties (comments, reviews, user bios, forum posts). `false` for author-written content — say why in a comment.
- Descriptions must not contain instructions that depend on runtime data.
- Consequential actions only through visible forms without autosubmit; no imperative write tools.

## Interplay with a strict CSP, Trusted Types, COOP
The WebMCP code itself needs nothing special: it uses no DOM sinks, and `fetch('/api/agents/…')` is covered by `connect-src 'self'`. `registerTool` is governed by the `tools` Permissions Policy (default `'self'`); don't add `Permissions-Policy: tools=()`.

If the same project hardens its headers (the reference project did, the day after WebMCP, prompted by PageSpeed), these are the traps that were hit:
- **Nonce-based CSP** (`'nonce-…' 'strict-dynamic'`) must be built in middleware per request and set on the **request** headers too (Next reads the nonce from the request CSP and stamps its own scripts). Remove any static CSP from `vercel.json`/`next.config` — two CSPs intersect and the static one blocks everything. Inline scripts rendered by server components (theme script, analytics consent) need `nonce` from a request header.
- **Trusted Types enforced** (`require-trusted-types-for 'script'`): install a filtering `default` policy as the first `<head>` script **and** from `instrumentation-client.ts` (Next's error-shell pages — 404s — draw `<head>` client-side, so the inline script never runs there). Escape `</` and `<!--` when serialising a policy into an inline script. Move inline scripts out of `next/script` `dangerouslySetInnerHTML` (on the client that is a `script.innerHTML` sink). Allow-list external script URLs (analytics, video providers).
- **Report-Only Trusted Types** cost a scored Lighthouse audit ("No issues in the Issues panel") and many reports per page view; prefer enforcing with a filtering default policy once proven in a browser.
- **COOP `same-origin`** is safe when nothing uses popups/`window.opener` (redirect-based OAuth and checkout are fine).
- **Hydration mismatches** show up as console errors that lower Best Practices: format dates with an explicit `timeZone` (server UTC vs browser local), never with hand-written locale tags.
