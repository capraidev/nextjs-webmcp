// app/api/agents/[name]/route.ts — the ONLY route under app/api/agents/.
import { NextResponse, type NextRequest } from "next/server";
import { inputFromQuery, toolByName, type Locale } from "@/lib/agents/tools";
// ADAPT: the project's rate limiter (shared across instances: DB/Redis, not in-memory),
// viewer/session reader, locale resolution and field-error formatter.
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { getViewer, GUEST } from "@/lib/auth/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sent by <AgentTools>: /api is outside the i18n middleware. */
export const LOCALE_HEADER = "x-page-locale";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

function refuse(error: string, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error }, { status, headers: { ...HEADERS, ...extra } });
}

/** Tools only read. A POST gets a readable 405; other methods get Next's own 405. */
export async function POST() {
  return refuse("This endpoint only accepts GET.", 405, { Allow: "GET" });
}

type Ctx = { params: Promise<{ name: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { name } = await params;
  const tool = toolByName(name);
  if (!tool) return refuse("Unknown tool.", 404);

  // Rate limit BEFORE validation: invalid calls cost too.
  const rl = await checkRateLimit(`agents:${tool.name}`, tool.limit);
  if (!rl.allowed) {
    return refuse("Too many requests, retry later.", 429, { "Retry-After": String(rl.retryAfterSeconds) });
  }

  const parsed = tool.input.safeParse(inputFromQuery(request.nextUrl.searchParams, tool));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input.", fields: parsed.error.flatten().fieldErrors },
      { status: 400, headers: HEADERS }
    );
  }

  let viewer = GUEST;
  try {
    viewer = await getViewer(); // same-origin cookies: the tool sees what the person sees
  } catch {
    viewer = GUEST; // expired/corrupt session → guest
  }
  const locale = (request.headers.get(LOCALE_HEADER) ?? "en") as Locale; // ADAPT: validate against locales

  try {
    const result = await tool.execute(parsed.data, { viewer, locale });
    if (result.ok) return NextResponse.json({ ok: true, data: result.data }, { headers: HEADERS });
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.fields && { fields: result.fields }) },
      { status: result.status, headers: HEADERS }
    );
  } catch (err) {
    console.error(`[agents] ${tool.name} failed:`, err); // details only in logs
    return refuse("The tool failed. Try again later.", 500);
  }
}
