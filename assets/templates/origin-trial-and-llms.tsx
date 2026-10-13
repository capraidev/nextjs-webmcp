/* ───────────── 1. Origin-trial tokens in app/layout.tsx ─────────────
   .env.example:
     # WebMCP origin trial tokens (public: they end up in the HTML).
     # Chrome: Origin Trials console → "WebMCP" → origin https://example.com
     # Edge:   Microsoft Edge origin trials console. Set them for PRODUCTION only.
     WEBMCP_ORIGIN_TRIAL_TOKEN=
     WEBMCP_ORIGIN_TRIAL_TOKEN_EDGE=
*/
function webmcpTokens(): string[] {
  return [process.env.WEBMCP_ORIGIN_TRIAL_TOKEN, process.env.WEBMCP_ORIGIN_TRIAL_TOKEN_EDGE]
    .map((t) => t?.trim() ?? "")
    .filter((t) => t.length > 0);
}

export function OriginTrialMeta() {
  // Render inside <head> of the ROOT layout. If the root layout already renders
  // other inline scripts that must come first (e.g. a Trusted Types policy),
  // keep those first and these metas after them.
  return (
    <>
      {webmcpTokens().map((token) => (
        <meta key={token} httpEquiv="origin-trial" content={token} />
      ))}
    </>
  );
}

/* ───────────── 2. "Agent tools" section of app/llms.txt/route.ts ─────────────
   Crawlers don't run WebMCP; llms.txt tells text-reading agents the tools exist,
   and doubles as human-readable documentation. Generate it from the registry. */
import { toolMetadata } from "@/lib/agents/tools";
import { AGENT_FORMS } from "@/lib/agents/forms";

export function agentToolsSection(siteUrl: string): string {
  const lines = [
    "## Agent tools",
    "",
    `Every page of ${siteUrl} registers these tools with WebMCP (document.modelContext) for agents ` +
      `working in the browser. They are read-only, and each one also answers GET ${siteUrl}/api/agents/<name>?<input> with JSON.`,
    "",
    ...toolMetadata().map(
      (t) => `- **${t.name}** (${t.annotations.readOnlyHint ? "read-only" : "acts"}): ${t.description}`
    ),
    "",
    "These forms are declared as WebMCP tools (declarative API): the agent fills them in, the visitor reviews and submits them.",
    "",
    ...Object.values(AGENT_FORMS).map((f) => `- **${f.toolname}** (form in ${f.where}): ${f.tooldescription}`),
  ];
  return lines.join("\n");
}
