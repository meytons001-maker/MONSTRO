import { previewRegistry } from "../../../../../lib/preview-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCKED_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding"]);
const BLOCKED_RESPONSE_HEADERS = new Set(["connection", "content-length", "transfer-encoding", "content-encoding"]);

async function proxy(request: Request, context: { params: Promise<{ taskId: string; path?: string[] }> }) {
  const { taskId, path = [] } = await context.params;
  const entry = previewRegistry.get(taskId);
  if (!entry) return Response.json({ error: "Preview not found or expired" }, { status: 404 });

  const incoming = new URL(request.url);
  const upstream = new URL(entry.handle.url);
  upstream.pathname = `/${path.map(encodeURIComponent).join("/")}`;
  upstream.search = incoming.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!BLOCKED_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const response = await fetch(upstream, { method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
