import { NextResponse } from "next/server";

const sec = [{ bearerAuth: [] }];
const ok = (desc: string) => ({ 200: { description: desc }, 400: { description: "Validation error" }, 401: { description: "Invalid API key" }, 403: { description: "Missing scope" }, 429: { description: "Rate limited" } });

const spec = {
  openapi: "3.1.0",
  info: { title: "Amanta API", version: "1.0.0", description: "Integration API. Authenticate with `Authorization: Bearer amk_<prefix>_<secret>`. Keys are scoped per organization and permission. All responses are `{ data }` or `{ error: { code, message } }`." },
  servers: [{ url: "/api/v1" }],
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
  security: sec,
  paths: {
    "/batches": {
      get: { summary: "List production batches (scope traceability:read)", responses: ok("Batches") },
      post: { summary: "Create a batch (scope traceability:write)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["batchNumber", "productId", "productionDate", "quantity", "unit"], properties: { batchNumber: { type: "string" }, productId: { type: "string" }, productionDate: { type: "string", format: "date" }, quantity: { type: "number" }, unit: { type: "string" }, inputs: { type: "array", items: { type: "object", properties: { lotId: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" } } } } } } } } }, responses: ok("Created batch") },
    },
    "/batches/{id}": { get: { summary: "Batch with backward/forward traceability (scope traceability:read)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: ok("Batch") } },
    "/ccp-records": {
      get: { summary: "List CCP readings (scope ccp:read)", parameters: [{ name: "controlId", in: "query", schema: { type: "string" } }, { name: "since", in: "query", schema: { type: "string", format: "date-time" } }], responses: ok("Readings") },
      post: { summary: "Submit a CCP reading, e.g. from a sensor (scope ccp:record). Temperatures in °C.", requestBody: { content: { "application/json": { schema: { type: "object", required: ["haccpControlId", "value"], properties: { haccpControlId: { type: "string" }, value: { type: "number" }, recordedAt: { type: "string", format: "date-time" }, batchId: { type: "string" }, note: { type: "string" } } } } } }, responses: ok("Recorded; includes deviationId when out of limits") },
    },
    "/deviations": {
      get: { summary: "List deviations (scope deviations:read)", parameters: [{ name: "open", in: "query", schema: { type: "boolean" } }], responses: ok("Deviations") },
      post: { summary: "Report a deviation (scope deviations:create)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["title", "description", "severity"], properties: { title: { type: "string" }, description: { type: "string" }, severity: { enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }, source: { enum: ["MANUAL", "SUPPLIER", "CUSTOMER_COMPLAINT", "AUDIT"] }, batchId: { type: "string" } } } } } }, responses: ok("Created") },
    },
    "/suppliers": { get: { summary: "Suppliers with certificate summary (scope suppliers:read)", responses: ok("Suppliers") } },
    "/haccp-controls": { get: { summary: "Approved HACCP controls/CCPs (scope haccp:read)", responses: ok("Controls") } },
  },
};

export function GET() {
  return NextResponse.json(spec, { headers: { "cache-control": "public, max-age=300" } });
}
