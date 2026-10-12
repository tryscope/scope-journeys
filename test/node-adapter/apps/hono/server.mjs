// A sample Hono app on @hono/node-server for `journeys init --node`: a documentation page and an API answering 401.
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/docs/quickstart", (c) => {
  const host = c.req.header("host") ?? "127.0.0.1";
  return c.html(`<!doctype html><html><head><title>Quickstart | Acme Hooks</title></head><body>\n<h1>Quickstart</h1>\n<p>Install the CLI, sign in, create a hook.</p>\n<p>Then read <a href="http://${host}/docs/install">the install guide</a>.</p>\n</body></html>\n`);
});

app.get("/api/v1/me", (c) => c.json({ error: { code: "unauthorized", message: "Sign in first." } }, 401));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`listening http://127.0.0.1:${info.port}`);
});
