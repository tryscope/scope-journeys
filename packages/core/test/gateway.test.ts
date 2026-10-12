// The URL the agent spoke to, as the proxy in front named it: x-forwarded-host, else Host, else
// the URL's own host (a server builds it from its listen address); the scheme from
// x-forwarded-proto. A value without a host's shape is passed over for the next source.
import assert from "node:assert/strict";
import { test } from "node:test";

import { forwardedUrl } from "../src/gateway.js";

const listen = new URL("http://localhost:3917/docs/quickstart?ref=ABCDEFGV");
const at = (headers: Record<string, string>, url: URL = listen): string => forwardedUrl(url, new Headers(headers)).href;

test("a next start request behind a proxy: the forwarded host and scheme, the path and query kept, the listen port gone", () => {
  assert.equal(at({ host: "docs.example", "x-forwarded-host": "docs.example", "x-forwarded-proto": "https" }), "https://docs.example/docs/quickstart?ref=ABCDEFGV");
  assert.equal(at({ host: "localhost:3917", "x-forwarded-host": "docs.example", "x-forwarded-proto": "https" }), "https://docs.example/docs/quickstart?ref=ABCDEFGV", "a proxy that rewrites Host to the upstream still names the agent's host");
  assert.equal(at({ host: "docs.example:8443", "x-forwarded-host": "docs.example:8443", "x-forwarded-proto": "https" }), "https://docs.example:8443/docs/quickstart?ref=ABCDEFGV", "a port the proxy names is kept");
});

test("no forwarded host: the Host header; neither: the URL's own host; the scheme stays the URL's without x-forwarded-proto", () => {
  assert.equal(at({ host: "127.0.0.1:3917" }), "http://127.0.0.1:3917/docs/quickstart?ref=ABCDEFGV");
  assert.equal(at({}), "http://localhost:3917/docs/quickstart?ref=ABCDEFGV");
  assert.equal(at({ "x-forwarded-proto": "https" }), "https://localhost:3917/docs/quickstart?ref=ABCDEFGV");
});

test("a request whose URL already names the host (Vercel, a Worker): nothing changes", () => {
  const vercel = new URL("https://acme.example/docs/quickstart");
  assert.equal(at({ host: "acme.example", "x-forwarded-host": "acme.example", "x-forwarded-proto": "https" }, vercel), vercel.href);
  assert.equal(at({}, vercel), vercel.href);
  assert.equal(at({ host: "ACME.example:443" }, vercel), vercel.href, "the host is normalised as a URL's");
});

test("lists are read by their first entry; a value without a host's shape, or one the parser refuses, is passed over", () => {
  assert.equal(at({ "x-forwarded-host": "docs.example, edge.internal", "x-forwarded-proto": "HTTPS, http" }), "https://docs.example/docs/quickstart?ref=ABCDEFGV");
  assert.equal(at({ "x-forwarded-host": "evil.example/x", host: "docs.example" }), "http://docs.example/docs/quickstart?ref=ABCDEFGV", "a path in the value is not a host");
  assert.equal(at({ "x-forwarded-host": "a b", host: "user@docs.example" }), "http://localhost:3917/docs/quickstart?ref=ABCDEFGV", "neither value has a host's shape");
  assert.equal(at({ "x-forwarded-host": "docs.example:99999", host: "docs.example" }), "http://docs.example/docs/quickstart?ref=ABCDEFGV", "a port past 65535 is refused by the parser");
  assert.equal(at({ "x-forwarded-host": "", host: "" }), "http://localhost:3917/docs/quickstart?ref=ABCDEFGV");
  assert.equal(at({ "x-forwarded-host": "[::1]:3000", "x-forwarded-proto": "ws" }), "http://[::1]:3000/docs/quickstart?ref=ABCDEFGV", "an address literal is a host; a scheme that is not http or https is not a scheme");
});
