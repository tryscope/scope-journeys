export async function GET(request: Request) {
  if (!request.headers.get("authorization")) {
    return Response.json({ error: { code: "unauthorized", message: "Missing API key." } }, { status: 401 });
  }
  return Response.json({ hooks: [{ id: "hk_1", hook: "orders" }] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return Response.json({ id: "hk_1", hook: (body as { hook?: string }).hook ?? "orders", url: "https://acme.example/hooks/catch/hk_1" }, { status: 201 });
}
