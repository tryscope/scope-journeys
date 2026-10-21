/**
 * The markdown face: a rendering for a fetcher whose Accept prefers markdown when the page has
 * none, built from the root map. Not implemented by sensor 0.1: a
 * `face` rule compiles, matches nothing and records a skipped decision with this reason, so the
 * console shows what the sensor did not do.
 */
export const FACE_NOT_IMPLEMENTED = "unsupported_kind:face";
