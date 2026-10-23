/* Generated from schemas/policy.json by scripts/types-from-schemas.mjs. Do not edit. */

/**
 * The configuration the sensor fetches. Immutable integer versions per customer; public to the customer; holds no secret (the sensor's validator refuses a secret-shaped value). A sensor that does not know a section ignores it; a rule kind it does not know runs as a skipped decision.
 */
export type ScopePolicy1 = {
  [k: string]: unknown;
} & {
  schema: "scope.policy/1";
  /**
   * the customer's policy version; 0 is the embedded forward-only default
   */
  version: number;
  about?: string;
  /**
   * ignored by the sensor: where traffic goes comes only from its own configuration (JOURNEYS_ORIGIN)
   */
  origin?: string | null;
  /**
   * ignored by the sensor: records go to JOURNEYS_API_URL in its own configuration, with the install key as Authorization: Bearer
   */
  report?: {
    url: string;
    key_header?: string;
    /**
     * reserved
     */
    kinds?: {};
  };
  /**
   * the regular-expression form: four expressions over the path plus the text faces; a policy with surfaces ignores every key but run_prefix
   */
  routes?: {
    /**
     * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
     */
    run_prefix?: string;
    passthrough?: Regex;
    not_content?: Regex;
    observed?: Regex;
    /**
     * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
     */
    text_faces?: string;
  };
  /**
   * the surface map: the roles of the product's paths, derived from the standards (MCP is one JSON-RPC endpoint carrying MCP-Session-Id and MCP-Protocol-Version; OAuth 2.1 names its registration (RFC 7591), authorization, token and device-authorization (RFC 8628) endpoints in its metadata documents (RFC 8414, RFC 9728); an API call carries a bearer) plus a short custom list. Classification precedence, first match wins: passthrough, custom (in order), finder, mcp, oauth.register, oauth.authorize, oauth.token, oauth.approve, device.start, device.poll, device.approve, hooks.create, hooks.catch, credentials, trial, cli.init, cli.beacon, signup, download, api, docs.llms and docs.root (docs_root), docs.paths (docs), else other.
   */
  surfaces?: {
    docs?: {
      paths?: RegexList;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      root?: string;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      llms?: string;
      /**
       * paths whose face is markdown or text regardless of the answer's content type
       */
      faces?: {
        md?: RegexList1;
        txt?: RegexList1;
      };
    };
    /**
     * installer and package downloads: an opener of an install journey when the url carries a reference
     */
    download?: {
      paths?: RegexList1;
    };
    api?: {
      paths?: RegexList1;
      credential_header?: string;
      actions?: RegexList2;
      action_success?: BodyMatch;
    };
    mcp?: {
      path?: Regex;
    };
    oauth?: {
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      metadata?: string;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      resource_metadata?: string;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      register?: string;
      authorize?: Regex;
      token?: Regex;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      approve?: string;
      fields?: FieldNames;
    };
    device?: {
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      start?: string;
      poll?: Regex;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      approve?: string;
      poll_approved?: BodyMatch1;
      fields?: FieldNames1;
    };
    /**
     * the sign-up form post; fields: reference (default via)
     */
    signup?:
      | Regex
      | {
          path: Regex;
          fields?: FieldNames2;
        };
    hooks?: {
      create?: Regex;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      catch?: string;
      fields?: FieldNames3;
    };
    /**
     * client credentials issued; fields: client_id
     */
    credentials?:
      | Regex
      | {
          path: Regex;
          fields?: FieldNames2;
        };
    /**
     * a trial key issued from code; fields: credential (default trial_key), install (default install_id)
     */
    trial?:
      | Regex
      | {
          path: Regex;
          fields?: FieldNames2;
        };
    cli?: {
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      init?: string;
      /**
       * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
       */
      beacon?: string;
      fields?: FieldNames4;
    };
    /**
     * how the reader family vendor-client is decided: the customer's own clients by pattern, never a hard-coded product string
     */
    clients?: {
      /**
       * a regular expression over the user agent that names the customer's own CLI
       */
      cli?: string;
      /**
       * the same for the customer's SDK
       */
      sdk?: string;
    };
    /**
     * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
     */
    finder?: string;
    passthrough?: RegexList3;
    /**
     * the customer's overrides, in order; an entry beats every standard entry
     */
    custom?: {
      pattern: Regex;
      role: Route;
      observed?: boolean;
    }[];
  };
  secrets: {
    /**
     * body fields hashed by name wherever they appear, beside the names the sensor always hashes in bodies and URLs (api_key, key, token, access_token, refresh_token, id_token, code, client_secret, password, secret, signature, sig, session_id, in any case or spelling, or a name whose last word is key, token, secret, password, signature or sig; such a field's whole value is hashed unless it is true or false, except code in an answer's body (usually an error code); a valid reference code stays readable only where headers.reference or a door's fields.reference names the field)
     */
    fields?: string[];
    /**
     * the product's signed-value shapes, hashed wherever they appear: path, query, body, Location
     */
    shapes?: string[];
    /**
     * a body field holding a url whose named parameter, in the query or the fragment, is a code; only that parameter's value is hashed
     */
    uri_fields?: {
      [k: string]: string;
    };
  };
  /**
   * the names of the headers the sensor reads; a name that is not a header name is ignored, and session, setup, agent, client and intent may not name one that carries a credential (a name with auth, cookie, token, secret, password, credential, key, jwt, assertion, oidc, signature, bypass, dpop, proof, hmac, csrf or xsrf in it, the credential header, surfaces.api.credential_header)
   */
  headers: {
    credential?: string;
    session?: string;
    /**
     * the query parameters that carry a reference
     */
    reference?: string[];
    install?: string | null;
    setup?: string | null;
    agent?: string | null;
    client?: string | null;
    intent?: string | null;
    signature?: string;
  };
  forward: {
    /**
     * the policy's own x- headers added on the hop to the origin, with {host} filled in; x-forwarded, x-forwarded-*, x-real-ip, x-client-ip, x-cluster-client-ip, x-originating-ip, x-host, x-original-*, x-rewrite-url, x-http-method, x-http-method-override, x-method-override, x-middleware-*, x-invoke-*, x-matched-path, x-prerender-*, x-vercel-*, x-nextjs-*, x-journeys-*, x-scope-*, x-envoy-*, a name that carries a credential, a value that is not one line of latin-1 or has a placeholder other than {host}, and any name not starting x- are ignored
     */
    headers?: {
      [k: string]: string;
    };
    /**
     * ignored by the sensor: the install key never goes to the origin; the signed assertion proves the hop
     */
    key_header?: string | null;
  };
  /**
   * false is the lightest form: bodies are read where a rule needs them and never leave; true records, on the routes the surface map observes and for an error answer (400 or above) on any route it does not pass through, only the fields observe.bodies.allow_fields names, with secret names and shapes hashed; true with no allowed field records no body
   */
  record_bodies?: boolean;
  /**
   * the body allowlist; routes, max_bytes and json_rpc are reserved and not read
   */
  observe?: {
    bodies?: {
      routes?: unknown[];
      /**
       * the body field names that may leave, at any depth: an allowed field keeps its whole value, any other is dropped; a body with no allowed field is recorded as null
       */
      allow_fields?: string[];
      max_bytes?: number;
      json_rpc?: boolean;
    };
  };
  rules: {
    id: string;
    kind: "inject" | "gate" | "finder" | "notfound" | "error" | "face";
    /**
     * dry_run computes what the rule would do, records it and changes nothing on the wire
     */
    mode?: "dry_run" | "live";
    /**
     * where a live rule is live; elsewhere it runs dry
     */
    environments?: ("production" | "preview" | "development")[];
    /**
     * closed is honoured by a gate only: the declaration call is refused instead of forwarded
     */
    on_error?: "open" | "closed";
    label?: string;
    /**
     * inject: a rewrite per face (html, md, txt); notfound: a page body per face, held to the same content as an inject replacement (with no html face, the md page is shown to a browser as escaped plain text)
     */
    faces?: {};
    /**
     * finder and gate: the exact path; error: a regular expression over the path
     */
    route?: string;
    form?: "tool" | "instructions" | "descriptions";
    tool?: {
      name: string;
      description?: string;
      inputSchema?: {};
    };
    acknowledgement?: string;
    instructions?: string;
    description_suffix?: string;
    answers?: {
      match: string;
      links: string[];
    }[];
    /**
     * finder: paths on the customer's site; anything else runs the rule dry
     */
    default_links?: string[];
    /**
     * error: a path on the customer's site per status; anything else runs the rule dry
     */
    links?: {
      [k: string]: string;
    };
    suffix?: string;
  }[];
  assertion?: {
    enabled?: boolean;
    audience?: string[];
  };
  /**
   * the Web Bot Auth signers whose key directories the sensor fetches, each an exact https origin such as https://chatgpt.com (an entry that is not one is ignored and named in the notices); a signature from any other signer is recorded as unlisted_signer and causes no outbound request
   */
  signers?: string[];
  destinations?: {
    kind?: "scope" | "otlp" | "webhook";
    url?: string;
    headers?: {};
    events?: unknown[];
  }[];
  retention_days?: number;
  salt_epoch?: number;
};
/**
 * a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document
 */
export type Regex = string;
/**
 * documentation pages: observed, content, references minted per serve
 */
export type RegexList = Regex[];
export type RegexList1 = Regex[];
/**
 * the API paths that are actions (a step with an outcome) rather than reads
 */
export type RegexList2 = Regex[];
/**
 * never observed, never recorded
 */
export type RegexList3 = Regex[];
export type Route =
  | "docs"
  | "docs_root"
  | "download"
  | "api"
  | "mcp"
  | "oauth.register"
  | "oauth.authorize"
  | "oauth.token"
  | "oauth.approve"
  | "device.start"
  | "device.poll"
  | "device.approve"
  | "signup"
  | "hooks.create"
  | "hooks.catch"
  | "credentials"
  | "trial"
  | "finder"
  | "cli.init"
  | "cli.beacon"
  | "passthrough"
  | "other";

/**
 * what a successful action's answer says; absent means any 2xx
 */
export interface BodyMatch {
  field: string;
  value: unknown;
}
/**
 * the body field names a door's keys live in, by key kind; a sensor and the stitcher read the same names
 */
export interface FieldNames {
  [k: string]: string | string[];
}
/**
 * what the poll's answer says when the person approved; default {status: approved}
 */
export interface BodyMatch1 {
  field: string;
  value: unknown;
}
/**
 * the body field names a door's keys live in, by key kind; a sensor and the stitcher read the same names
 */
export interface FieldNames1 {
  [k: string]: string | string[];
}
/**
 * the body field names a door's keys live in, by key kind; a sensor and the stitcher read the same names
 */
export interface FieldNames2 {
  [k: string]: string | string[];
}
/**
 * the body field names a door's keys live in, by key kind; a sensor and the stitcher read the same names
 */
export interface FieldNames3 {
  [k: string]: string | string[];
}
/**
 * the body field names a door's keys live in, by key kind; a sensor and the stitcher read the same names
 */
export interface FieldNames4 {
  [k: string]: string | string[];
}
