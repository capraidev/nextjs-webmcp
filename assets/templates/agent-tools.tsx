"use client";
// components/agent-tools.tsx — mount ONCE in the public layout:
//   <AgentTools tools={toolMetadata()} locale={locale} />
// (toolMetadata() runs on the server; only plain data crosses to the client.)

import { useEffect } from "react";
import type { ToolMetadata } from "@/lib/agents/tools";

const LOCALE_HEADER = "x-page-locale"; // keep in sync with the gateway

export function AgentTools({ tools, locale }: { tools: ToolMetadata[]; locale: string }) {
  useEffect(() => {
    const mc = document.modelContext ?? navigator.modelContext;
    if (!mc || typeof mc.registerTool !== "function") return; // no WebMCP: do nothing

    const controller = new AbortController();
    for (const tool of tools) {
      try {
        mc.registerTool(
          {
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            execute: (input, client) => call(tool.name, input, locale, client?.signal),
          },
          { signal: controller.signal }
        ).catch(report); // rejects on duplicate names (Strict Mode, another instance)
      } catch (err) {
        report(err);
      }
    }
    // No unregisterTool in the draft: aborting the signal removes the tools.
    return () => controller.abort();
  }, [tools, locale]);

  return null;
}

function report(err: unknown) {
  if (process.env.NODE_ENV === "development") console.warn("[WebMCP] registration failed:", err);
}

/** MCP-shaped result: data as JSON text; failures as readable text with isError. */
function text(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) }],
    ...(isError && { isError: true }),
  };
}

async function call(
  name: string,
  input: Record<string, unknown> | undefined,
  locale: string,
  signal: AbortSignal | undefined
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined || value === null) continue;
    query.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const qs = query.toString();
  try {
    const res = await fetch(`/api/agents/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: { [LOCALE_HEADER]: locale, Accept: "application/json" },
      credentials: "same-origin",
      signal,
    });
    const body = (await res.json().catch(() => null)) as
      | { ok: true; data: unknown }
      | { ok: false; error: string; fields?: Record<string, string[]> }
      | null;
    if (body?.ok) return text(body.data);
    if (body && !body.ok) return text(body.fields ? { error: body.error, fields: body.fields } : body.error, true);
    return text(`HTTP ${res.status}`, true);
  } catch (err) {
    return text(err instanceof Error ? err.message : String(err), true);
  }
}
