import { DECLARATION_SCHEMA, POLICY_SCHEMA, RECORD_SCHEMA } from "../record.js";
import { VERSION } from "../version.js";

export function versionReport(): Record<string, string> {
  return {
    package: `scope-journeys ${VERSION}`,
    record_schema: RECORD_SCHEMA,
    declaration_schema: DECLARATION_SCHEMA,
    policy_schema: POLICY_SCHEMA,
    node: process.version,
  };
}
