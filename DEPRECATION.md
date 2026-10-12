# Deprecation

How a breaking change reaches a sensor in the field (architecture section 10.5): it deprecates first and keeps the old path for two minor versions, so a customer who updates on their own cadence never meets a hard break without two releases of notice.

## The policy

- **Packages.** A change that removes or renames something a customer's code or policy uses is announced in the release notes of the minor that introduces its replacement, kept working for the two following minors, and removed in the third. A row below names the end version.
- **Record schemas.** The ingest accepts the current record-schema major and the previous one. A record of the previous major is accepted and the batch's answer carries `warnings: ["schema_major_deprecated"]`; the console's install card shows it. A record of an unknown major is refused (`unknown_schema`). The previous major stops being accepted two minors after the current major shipped.
- **Old sensors.** The API carries the minimum observer version it supports (`JOURNEYS_MIN_OBSERVER_VERSION`); a batch from an older sensor is accepted and answered with `warnings: ["observer_outdated"]`, which the install card shows beside the version the ingest last saw. `journeys doctor` says "a newer sensor exists; npm update and redeploy" when the sensor is older than the CLI.
- **Policy sections and rule kinds.** A sensor never refuses a policy it does not fully understand: a section it does not know is ignored and named in the compiler's notices (the adapters log them once per policy load); a rule whose kind it does not know runs as `dry_run`, recording one `skipped` decision per observed request with the reason `unsupported_kind:<kind>`, so the console shows the rule waiting on a newer sensor instead of silently doing nothing. `journeys policy validate` reports an unknown kind against the schema the CLI ships.
- **The vocabulary of the warnings.** `observer_outdated` (update the sensor), `schema_major_deprecated` (update the sensor before the end date of the major's row), `unknown_schema` (the batch was refused; the sensor is newer than the API or corrupt).

## The rows

| what | deprecated in | replaced by | the warning or notice | ends in |
|---|---|---|---|---|
| The `routes` section of `scope.policy/1` (the four route expressions `passthrough`, `not_content`, `observed`, `text_faces` the lab's sensor read) | 0.1.0 | the `surfaces` map (`docs`, `api`, `mcp`, `oauth`, `device`, `hooks`, `credentials`, `trial`, `cli`, `clients`, `finder`, `passthrough`, `custom`), from which the compiler derives the same four expressions | the compiler's notice `routes ignored: surfaces present` when both are given, and `routes form: move to surfaces` when only `routes` is | 0.3.0: `compilePolicy` stops reading `routes` |
