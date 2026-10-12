// A sample Express app for `journeys init --node`: a documentation page and an API answering 401.
import express from "express";

const app = express();

app.get("/docs/quickstart", (request, response) => {
  const host = request.headers.host ?? "127.0.0.1";
  response.type("html").send(`<!doctype html><html><head><title>Quickstart | Acme Hooks</title></head><body>\n<h1>Quickstart</h1>\n<p>Install the CLI, sign in, create a hook.</p>\n<p>Then read <a href="http://${host}/docs/install">the install guide</a>.</p>\n</body></html>\n`);
});

app.get("/api/v1/me", (_request, response) => {
  response.status(401).json({ error: { code: "unauthorized", message: "Sign in first." } });
});

const server = app.listen(Number(process.env.PORT ?? 3000), "127.0.0.1", () => {
  const address = server.address();
  console.log(`listening http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
});
