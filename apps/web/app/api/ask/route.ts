// The assistant's server endpoint ("Ask burnrate"). POST: one question, answered as a stream of
// newline-delimited JSON events. GET: whether live answers are possible, and the stored
// questions. The logic is in lib/assistant/handler.ts; this file only wires it to Next.js.
// Not cached: every request runs on the server (Node runtime). next.config.ts forwards only
// /api/v1/*, so this route stays in the app.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { createAskHandler } from "@/lib/assistant/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createAskHandler();

export async function GET() {
  return handler.status();
}

export async function POST(request: Request) {
  return handler.ask(request);
}
