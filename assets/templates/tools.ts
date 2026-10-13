import "server-only";
import { z } from "zod"; // Zod 4: z.toJSONSchema is built in

/**
 * THE registry of agent tools — the only list. Three consumers:
 *  1. <AgentTools> registers toolMetadata() in the browser (WebMCP);
 *  2. app/api/agents/[name]/route.ts looks tools up here and runs execute();
 *  3. llms.txt prints an "Agent tools" section from toolMetadata().
 *
 * Rules:
 *  - read-only tools only (readOnlyHint: true, GET). Actions with consequences are
 *    the site's own forms, annotated with the declarative API (lib/agents/forms.ts);
 *  - names: English snake_case, stable. Titles/descriptions: English, for a model —
 *    what it does, when to use it, what it never does;
 *  - access rules are NOT written here: call the site's existing functions
 *    (e.g. canAccessPost / postAccessWhere / the published+not-trashed filter);
 *  - never return personal data (names, emails of other people), never secrets;
 *  - URLs in results are absolute (use the site's URL helper).
 *
 * ADAPT: replace the imports/placeholders marked ADAPT with the project's own.
 */

// ADAPT: the project's viewer/session type and locale list
export type Viewer = { userId: string | null; roles: string[] };
export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];

export type ToolContext = { viewer: Viewer; locale: Locale };

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; fields?: Record<string, string[]>; status: number };

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  consequentialHint?: boolean;
  untrustedContentHint?: boolean;
};

export type Tool<S extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: ToolAnnotations;
  /** Calls per IP per tool, enforced by the gateway. */
  limit: { limit: number; windowSeconds: number };
  execute(input: z.output<S>, ctx: ToolContext): Promise<ToolResult>;
};

const language = z
  .enum(LOCALES)
  .optional()
  .describe("Language of the returned content. Defaults to the language of the page the agent is on.");

/** Helper that keeps the generic type of each entry. */
function tool<S extends z.ZodType>(t: Tool<S>): Tool {
  return t as unknown as Tool;
}

export const TOOLS: readonly Tool[] = [
  tool({
    name: "search_content",
    title: "Search the site",
    description:
      "Full-text search across the articles and courses of EXAMPLE.COM. Use it to find content on a topic, " +
      "then call get_article or get_course with a result's url. Only content the current visitor may open is returned.",
    input: z.object({
      query: z.string().trim().min(2).max(200).describe("Words to search for."),
      limit: z.number().int().min(1).max(20).default(10).describe("Maximum number of results."),
      language,
    }),
    // Author-written content: untrustedContentHint stays false. Set it to true for
    // tools that return user-generated text (comments, reviews, forum posts).
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    limit: { limit: 60, windowSeconds: 60 },
    async execute(input, ctx) {
      // ADAPT: call the SAME search function the site's search route uses (extract it to lib/data first).
      void input;
      void ctx;
      return { ok: true, data: { results: [] } };
    },
  }),
  // ADAPT: list_articles, get_article (markdown body; restricted → available:false with title+url only),
  // list_products/courses, get_product/course (price, programme, viewer.nextStep), verify_certificate…
];

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** JSON Schema of a tool's input, as the agent reads it. */
export function jsonSchemaOf(t: Tool): Record<string, unknown> {
  // io: "input" → a field with a default is optional for the caller.
  const schema = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export type ToolMetadata = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
};

/** What the browser and llms.txt receive: never the functions. */
export function toolMetadata(): ToolMetadata[] {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: jsonSchemaOf(t),
    annotations: { ...t.annotations },
  }));
}

/**
 * Input from a query string. A query only carries strings: fields the JSON Schema
 * declares as strings stay strings ("2026" is a search, not a number); the others
 * are parsed as JSON (5, true, ["a"]). Unparsable values stay strings and the Zod
 * schema rejects them with a field error the agent can fix.
 */
export function inputFromQuery(params: URLSearchParams, t: Tool): Record<string, unknown> {
  const props = (jsonSchemaOf(t).properties ?? {}) as Record<string, { type?: unknown }>;
  const input: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (props[key]?.type === "string") {
      input[key] = value;
      continue;
    }
    try {
      input[key] = JSON.parse(value);
    } catch {
      input[key] = value;
    }
  }
  return input;
}
