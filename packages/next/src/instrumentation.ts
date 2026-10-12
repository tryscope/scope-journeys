/**
 * `export { onRequestError } from "scope-journeys-next/instrumentation"` in instrumentation.ts:
 * logs the error's name, the route and the x-journeys-request-id the inner hop carried, so your own
 * error tracking can be joined to the record. It ships nothing to Scope.
 */
export function onRequestError(error: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: { routerKind: string; routePath: string; routeType: string }): void {
  const id = request.headers["x-journeys-request-id"];
  const name = error instanceof Error ? error.name : "Error";
  console.error(`journeys: ${name} on ${request.method} ${context.routePath} (${context.routerKind} ${context.routeType})${id ? ` request ${Array.isArray(id) ? id.join(",") : id}` : ""}`);
}
