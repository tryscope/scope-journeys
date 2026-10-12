# Install: connectors

The first day for a product that will not deploy code yet: your platform's own request log, delivered to Scope, shows the traffic of coding agents on your hosts and the list of what the sensor would add (names on installs, sign-in outcomes, intent, the joins). A connector records the request log and nothing more: no body, no rule, nothing on the wire.

A connector is an install like any other (an id, a key, a card on the Installs page) whose form is `drain-vercel` or `drain-cloudflare`. Its records carry `source: drain`. Where a sensor also fronts the host, a log line and the sensor's record of the same request are joined on the platform's request id and counted once.

## Create one

From the console's Installs page, "add a connector", choose the platform. The console shows the connector's secret once; it is the install key, rotatable and revocable like a sensor's.

## Vercel: a log drain

In the Vercel team settings, Drains: a new log drain for the project, format JSON, destination `https://api.tryscope.com/v1/connectors/vercel`, with the custom header `Authorization: Bearer <the secret>`. Vercel verifies the destination when the drain is created; the endpoint answers the handshake itself. When you also set the drain's signing secret, paste the same secret there: the signature is verified in addition to the bearer.

## Cloudflare: a Logpush job

A Logpush job for the zone's HTTP requests with the destination `https://api.tryscope.com/v1/connectors/cloudflare?install=jin_your_install_id&header_Authorization=Bearer%20<the secret>`; the header rides in the destination string, as Logpush carries custom headers. The job's first delivery is Cloudflare's ownership challenge; the console shows the token to paste back. The fields to send and the API calls, verbatim: [Connect Cloudflare Logpush](/connect-cloudflare).

## What arrives

Within minutes the Installs page shows the connector's deliveries and the traffic preview: the hosts, the readers, the routes. Everything a sensor adds (the joins across the sign-in, the intent, the rules) waits for the sensor form you choose next: [Next on Vercel](/install/next) or [a Cloudflare zone](/install/cloudflare).
