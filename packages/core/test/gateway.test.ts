// The URL the agent spoke to, as the proxy in front named it: x-forwarded-host, else Host, else
// the URL's own host (a server builds it from its listen address); the scheme from
// x-forwarded-proto. A value without a host's shape is passed over for the next source. Which
// origins the hop may go to and the URL it goes to, and which hop failures prove the origin never
// received the request, from the errors Node really raises.
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { test } from "node:test";

import { forwardedClient, forwardedUrl, hopUrl, isHost, neverSent, originUrl, trustedProxies } from "../src/gateway.js";

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

test("isHost: a name or an address literal, with a port or without, that the URL parser also takes", () => {
  for (const host of ["docs.example", "docs.example:8443", "127.0.0.1:3917", "[::1]", "[::1]:3000"]) assert.equal(isHost(host), true, host);
  for (const host of ["", "docs.example/x", "user@docs.example", "docs.example:99999"]) assert.equal(isHost(host), false, host);
});

test("neverSent: a refused connection and a host that does not resolve, from node:http and from fetch, prove the origin never received the request; a connection dropped after the request left does not, nor does anything unknown", async () => {
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const address = closed.address();
  const refused = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/x`;
  await new Promise((resolve) => closed.close(resolve));
  // The origin reads the whole request, acts on it, then drops the connection without answering.
  const dropper = createServer((req) => req.resume().on("end", () => req.socket.destroy()));
  await new Promise<void>((resolve) => dropper.listen(0, "127.0.0.1", resolve));
  const dropAddress = dropper.address();
  const dropped = `http://127.0.0.1:${typeof dropAddress === "object" && dropAddress ? dropAddress.port : 0}/x`;
  const viaHttp = (url: string): Promise<unknown> =>
    new Promise((resolve) => {
      const r = request(url, { method: "POST" }, () => resolve(null));
      r.on("error", resolve);
      r.end("{}");
    });
  const viaFetch = (url: string): Promise<unknown> => fetch(url, { method: "POST", body: "{}" }).then(() => null, (error: unknown) => error);
  try {
    for (const via of [viaHttp, viaFetch]) {
      assert.equal(neverSent(await via(refused)), true, `${via.name}: refused`);
      assert.equal(neverSent(await via("http://journeys-test.invalid/x")), true, `${via.name}: a host that does not resolve`);
      const after = await via(dropped);
      assert.ok(after instanceof Error, `${via.name}: the drop is an error`);
      assert.equal(neverSent(after), false, `${via.name}: dropped after the request left`);
    }
  } finally {
    dropper.close();
  }
  assert.equal(neverSent(new DOMException("The operation was aborted due to timeout", "TimeoutError")), false, "a timeout may come after the request left");
  assert.equal(neverSent(new Error("anything")), false);
  assert.equal(neverSent({ code: "ECONNREFUSED" }), false, "not an error: unknown");
  assert.equal(neverSent("ECONNREFUSED"), false);
});

test("originUrl: an http or https URL with no credentials, and nothing else", () => {
  assert.equal(originUrl("http://127.0.0.1:3000")?.href, "http://127.0.0.1:3000/");
  assert.equal(originUrl("https://docs.example.com/base")?.href, "https://docs.example.com/base");
  assert.equal(originUrl("HTTPS://Docs.Example.com")?.host, "docs.example.com", "the scheme and host are read as a URL's");
  for (const value of ["localhost:3000", "docs.example.com", "ftp://docs.example.com", "file:///etc/passwd", "https://user:pass@docs.example.com", "https://user@docs.example.com", "https://", "https:", "", "/docs"]) assert.equal(originUrl(value), null, value);
});

test("hopUrl: the request's path and query under the origin's own path, on the origin's host whatever the path says", () => {
  const request = new URL("https://acme.example/docs/quickstart?ref=ABCDEFGV#top");
  assert.equal(hopUrl(new URL("http://127.0.0.1:3000"), request).href, "http://127.0.0.1:3000/docs/quickstart?ref=ABCDEFGV");
  assert.equal(hopUrl(new URL("https://origin.example/base/"), request).href, "https://origin.example/base/docs/quickstart?ref=ABCDEFGV");
  assert.equal(hopUrl(new URL("https://origin.example/base"), request).href, "https://origin.example/base/docs/quickstart?ref=ABCDEFGV");
  assert.equal(hopUrl(new URL("https://origin.example/?x=1#h"), request).href, "https://origin.example/docs/quickstart?ref=ABCDEFGV", "the origin's own query and fragment are not the request's");
  assert.equal(hopUrl(new URL("https://origin.example"), new URL("https://acme.example//evil.example/x")).host, "origin.example", "a path that looks like a host stays a path");
});

test("trustedProxies: JOURNEYS_TRUST_PROXY as a positive whole number of proxies, else null", () => {
  assert.equal(trustedProxies("1"), 1);
  assert.equal(trustedProxies(" 2 "), 2);
  for (const value of [undefined, "", "0", "true", "yes", "-1", "1.5", "100"]) assert.equal(trustedProxies(value), null, String(value));
});

test("forwardedClient: the entry the outermost trusted proxy appended, counted from the end of x-forwarded-for", () => {
  assert.equal(forwardedClient("1.2.3.4, 203.0.113.7", 1), "203.0.113.7", "the visitor wrote the first entry, the load balancer appended the last");
  assert.equal(forwardedClient("1.2.3.4, 203.0.113.7, 198.51.100.2", 2), "203.0.113.7", "a CDN in front of the load balancer");
  assert.equal(forwardedClient("203.0.113.7", 2), "203.0.113.7", "a list shorter than the count gives its first entry");
  assert.equal(forwardedClient("2001:db8::1 ,, 203.0.113.7 ", 1), "203.0.113.7", "entries are trimmed, empty ones skipped");
  assert.equal(forwardedClient("", 1), null);
  assert.equal(forwardedClient(null, 1), null);
});
