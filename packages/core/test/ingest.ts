// The ingest's answer to a stored batch, as the sensor's tests stand in for it: the shipper takes a
// 2xx for stored only when it carries this shape. Web APIs only, so the workerd tests can use it.
export const stored = (accepted: number): Response => Response.json({ accepted, rejected: [], warnings: [] }, { status: 202 });
