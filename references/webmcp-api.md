# WebMCP API facts (snapshot: October 2026)

These facts were verified on 12 October 2026 against the W3C CG draft and Chrome's documentation. **Re-verify before use** — see "How to re-verify" at the end.

## Contents
1. Imperative API (IDL)
2. Declarative API (forms)
3. Annotations and security semantics
4. Browser support, origin trial, flags
5. Lighthouse "Agentic browsing"
6. Polyfills and types
7. What was removed (don't use)
8. How to re-verify

## 1. Imperative API

```webidl
partial interface Document { [SecureContext, SameObject] readonly attribute ModelContext modelContext; };

[Exposed=Window, SecureContext]
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool, optional object inputObject, optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange; attribute EventHandler ontoolactivated; attribute EventHandler ontoolcancel;
};

dictionary ModelContextTool {
  required DOMString name; USVString title; required DOMString description;
  object inputSchema;                  // JSON Schema
  required ToolExecuteCallback execute;
  ToolAnnotations annotations;
};
dictionary ToolAnnotations {
  boolean readOnlyHint = false; boolean untrustedContentHint = false;
  boolean consequentialHint = false; boolean debugging = false;
};
callback ToolExecuteCallback = Promise<any> (object inputObject, ToolExecuteCallbackOptions options); // options.signal
dictionary ModelContextRegisterToolOptions { sequence<USVString> exposedTo; AbortSignal signal; };
```

- `registerTool` rejects on: duplicate name, empty name/description, invalid `inputSchema`, `NotAllowedError` when the `tools` permissions policy disallows it.
- **Unregister = abort the `signal`.** No `unregisterTool`, no `updateTool`.
- `execute` may return any JSON-serialisable value. Return MCP-shaped `{ content: [{ type: "text", text }] }` for compatibility with agents that bridge to MCP.
- `getTools` / `executeTool` are for agents running inside the page; the browser's own agent uses an internal path.
- Permissions Policy feature `"tools"`, default allowlist `'self'`. Cross-origin iframes need `allow="tools"`; sharing a tool with other origins is opt-in via `exposedTo`.
- Feature detection: `const mc = document.modelContext ?? navigator.modelContext; if (mc?.registerTool) …` (the `navigator` alias exists only in older Chrome builds).

## 2. Declarative API

Documented by Chrome (`/docs/ai/webmcp/declarative-api`); still an explainer in the CG repo.
- On `<form>`: `toolname`, `tooldescription`, optional boolean `toolautosubmit`. Removing either `toolname` or `tooldescription` unregisters the tool.
- On controls: `toolparamdescription`; the parameter name is the control's `name`.
- `SubmitEvent.agentInvoked` (boolean) and `SubmitEvent.respondWith(Promise)` — call `preventDefault()` first.
- CSS pseudo-classes `:tool-form-active`, `:tool-submit-active`; events `toolactivated`, `toolcancel`.
- Undecided in the draft: schema synthesis details, response mechanism, `outputSchema`.

## 3. Annotations

- `readOnlyHint` — the tool changes nothing; agents may call it without asking.
- `consequentialHint` — real-world or irreversible effects; agent/browser should ask the user.
- `untrustedContentHint` — output contains user-generated or third-party text (prompt-injection risk). Leave `false` for author-written content and say why in a comment; set `true` for comments, reviews, forum posts, user profiles.
- Treat every tool like a public endpoint: re-check authorisation at execution time.

## 4. Browser support

- **Chrome**: origin trial from **149**. Local testing: `chrome://flags/#enable-webmcp-testing`. Real visitors need the trial token (meta tag or `Origin-Trial` header). Registration: Chrome Origin Trials console → "WebMCP" → origin `https://example.com` (no `www`, no trailing slash; subdomain matching only if needed; third-party matching off).
- **Edge**: origin trial from **150** (Microsoft Edge origin trials console), separate token; browsers ignore each other's tokens, both meta tags can coexist.
- Firefox, Safari: no support/commitment at the time.
- Consumers seen: Gemini in Chrome, ChatGPT Desktop, browser extensions (MCP-B), "Model Context Tool Inspector" extension for debugging.
- Tokens expire with the trial; when the feature ships, tokens become unnecessary.

## 5. Lighthouse "Agentic browsing" (experimental, Chrome 150+)

- **Registered WebMCP tools** — informational list; warns above **40** tools.
- **WebMCP schema validity** — input schemas must be valid JSON Schema.
- **Forms missing declarative WebMCP** — lists forms without `toolname`. Intentional exclusions (registration with consent, payments) will appear: document them.

## 6. Polyfills and types

- `@mcp-b/webmcp-polyfill`, `@mcp-b/global`, `@mcp-b/react-webmcp`, `usewebmcp` — active but pre-standard, frequent breaking majors (6.0.0 removed the `navigator` alias). Recommendation: **no runtime dependency**; write ~60 lines of types from the IDL (`assets/templates/webmcp.d.ts`).
- `webmcp-types` is the types package linked from the spec README, if you prefer a dependency; pin it exactly.

## 7. Removed — do not use

`navigator.modelContext` as primary API, `provideContext()`, `clearContext()`, `unregisterTool()`, `requestUserInteraction()` (user confirmation now comes from `consequentialHint` or from declarative forms without autosubmit).

## 8. How to re-verify

1. `github.com/webmachinelearning/webmcp`: `index.bs` (IDL), `implementation-status.md`, `declarative-api-explainer.md`, open issues about naming.
2. `developer.chrome.com/docs/ai/webmcp` and sub-pages; `developer.chrome.com/docs/lighthouse/agentic-browsing/*`.
3. npm: latest versions of `@mcp-b/*`, `webmcp-types`.
4. If a page is blocked by the network policy, use web search restricted to the domain, or fetch the GitHub raw file.
Write down the date and sources you used in the delivery note.
