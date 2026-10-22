# Policy

The policy is the document that tells the sensor what to observe and what each rule may do. It is public: it holds no secret, it is fetched by the sensor from `GET /v1/installs/{id}/policy` with an `ETag` and cached for sixty seconds, and the embedded default (version 0) observes and forwards only. The console edits it; a version is promoted, never edited in place, so the records always name the version that produced them (`observer.policy_version`).

**Every rule is dry run when installed; nothing changes until you flip it.** A rule in `dry_run` computes what it would do, records it in the request's decisions and changes nothing on the wire; the console shows the would-apply counts per rule. `live` applies it. Each rule can be live in some environments and dry run in the others (`environments`), so a rule goes live on preview before production.

**A live rule applies only where the surface map names.** `inject` and `notfound` act on the documentation paths the map lists (`docs.paths`, `docs.root`, `docs.llms`, a `custom` entry with a docs role), `finder` and `gate` on their exact routes, `error` on its route pattern. A path the map does not name is `other`: nothing is read from it and no rule changes it, whatever the origin serves and whoever the reader is. Every change a live rule makes is served to people and agents alike; there is no agent-only answer.

## The sections

| section | meaning |
|---|---|
| `schema`, `version` | `scope.policy/1` and the document's version |
| `about` | a free description |
| `origin` | ignored: where your traffic goes comes only from the sensor's own configuration (`JOURNEYS_ORIGIN`), never from the policy |
| `report` | ignored: records go to `JOURNEYS_API_URL` in the sensor's own configuration, with the install key as `Authorization: Bearer` |
| `surfaces` | the surface map: the paths of each surface of your product (`docs`, `download`, `api`, `mcp`, `oauth`, `device`, `signup`, `hooks`, `credentials`, `trial`, `cli`, `clients`, `finder`, `passthrough`, `custom`), so each request is classified by what it is for |
| `routes` | the older form of the surface map, still read; new documents use `surfaces` |
| `secrets` | the value shapes hashed wherever they appear (a key prefix, a token pattern) |
| `headers` | the names of the setup, agent, client and intent headers the sensor reads; a name that is not a header name, or one that carries a credential (`Authorization`, `Cookie`, a name with auth, token, secret, password, key, jwt, assertion, oidc, signature, bypass, dpop, proof, hmac, csrf or xsrf in it, your credential headers), is ignored |
| `forward` | the policy's own `x-` headers added on the hop to the origin (with `{host}` filled in); never one that frames the request, names its host or client (`x-forwarded-*`, `x-real-ip`), steers your framework (`x-middleware-*`, `x-vercel-*`, `x-nextjs-*`), speaks for the sensor (`x-scope-*`, `x-journeys-*`) or carries a credential, and each value is one line of latin-1 text; the install key never goes to the origin |
| `record_bodies` | `false`, the default, is the lightest form: bodies are read where a rule needs them and never leave; `true` records the bodies of the routes you list, every field but your secret fields and shapes as sent |
| `observe` | the routes whose request and response bodies are recorded, the fields allowed, the limit |
| `rules` | the rule table, below |
| `assertion` | whether the sensor signs an assertion of what it saw on each forwarded request, for your app to verify |
| `signers` | the Web Bot Auth signers whose key directories the sensor fetches to verify a signature, each an exact https origin (`https://chatgpt.com`); absent, Exa's crawler and ChatGPT; a signature from any other signer is recorded as `unlisted_signer` and causes no request |
| `destinations` | your own OpenTelemetry collector, when records and traces should also go there |
| `retention_days`, `salt_epoch` | how long records are kept; the epoch of the hash salt, advanced by `journeys rotate-salt` on your request (journeys never join across epochs) |

## The six rule kinds

| kind | what it does when live | what it records in dry run |
|---|---|---|
| `inject` | adds a short reference code to the links, the install command and the MCP URL on a documentation page the map names, and a setup and intent header line to its API samples; a path the map does not name is left as it is | the page's canonical path and what would have been placed |
| `gate` | lists a tool named `declare_intent` first in your MCP server's tool list, answers it itself with a fixed acknowledgement and never forwards it to your server | the call that would have been answered |
| `finder` | answers a documentation-finder route (`/api/docs/find`) itself with links to your guides | the query and the links that would have been returned |
| `notfound` | answers a documentation path the map names that your origin does not have with a page listing your real guides; the status stays 404; a 404 on a path the map does not name passes through as the origin answered it | the path and the page that would have been served |
| `error` | appends "Guide: <link>" to your API's own error messages for the statuses you choose | the status and the link that would have been appended |
| `face` | serves the markdown face of a page to a reader who asked for it | the face that would have been served |

Every rule has `id`, `kind`, `mode` (`dry_run` or `live`), `environments` (the environments it is live in) and, for `gate` only, `on_error` (`open` forwards the call untouched when the rule fails; `closed` refuses it). Anything else in a rule is the kind's own fields (the paths, the statuses, the links).

**What a rule may put into a page.** An `inject` replacement and a `notfound` page hold plain text, the placeholders `{host}`, `{prefix}` and `{token}`, the groups `$1` to `$9`, and on the HTML face only `<!doctype html>` and whole tags from `a`, `blockquote`, `body`, `code`, `h1`, `head`, `html`, `li`, `meta`, `p`, `pre`, `title` and `ul`, with no attribute but an `a`'s `href` and a `meta`'s `charset` of `utf-8`; a `>` outside a tag is written `&gt;`. On the markdown and text faces, and in a `gate`'s texts and an `error` suffix, which a reader may render as markdown or HTML, the text holds no tag with an attribute or a quote, no end tag, comment or autolink, no tag that runs, loads or hides what follows (`script`, `style`, `iframe` and the like) and no character reference such as `&#47;`; a placeholder such as `<one sentence: what the person asked you to do>` is fine. The only address a rule's own text names is `https://{host}`, followed by a path, a query, a fragment or the end of the word: no other address with a scheme or starting `//`, no `www.` or mail address, and outside HTML no other `scheme:` either. An HTML `href` points at `https://{host}` or is a path, with no character reference (an `&` between query parameters stays a plain `&`), and the `finder` and `error` links are paths. A rule that holds anything else, or a pattern that does not compile or repeats a group that itself holds a repeat (such as `(a+)+`, or `(/[a-z-]+)*` in a path, where `(/[a-z/-]+)?` does the same job), runs dry, and `journeys policy validate` names it; such a pattern in the surface map or the secret shapes refuses the whole document, and the sensor keeps its last good policy. A pattern holds no placeholder but `{host}`, and a replacement uses its groups in order, each once; a match whose groups lie outside it, or out of the page's order, keeps the page's text. A rule that would make a page more than twice its size plus 64 KiB is left out of that page, and the record shows an `errored` decision for it. Where it lands inside a tag, an inline script or style, a title or a text area of your page, or where its text meets your page's text inside a word on the markdown or text face (a letter outside ASCII, as in Japanese text, counts as part of a word), it only continues a link to your own site past the host, with a link-safe code such as `?ref=`.

## Validate a document

```
npx scope-journeys policy validate policy.json
```

validates the document against the schema the packages ship and scans it for secret-shaped values; a document holding one is refused by the API too (`400 policy_holds_secret`). The schema is `schemas/policy.json` in `scope-journeys`.
