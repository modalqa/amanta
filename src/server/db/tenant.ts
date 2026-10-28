import "server-only";
import { prisma } from "./client";
import { AppError } from "../errors";

/** Models that carry an `organizationId` column and must always be scoped. */
export const TENANT_MODELS = new Set([
  "Membership", "Invitation", "ApiKey", "OrgSecret", "AuditLog", "Counter",
  "Document", "AiRun", "Product", "HaccpControl", "ChecklistTemplate", "ChecklistItem",
  "ChecklistSubmission", "ChecklistResponse", "CcpRecord", "Deviation", "Capa",
  "Supplier", "SupplierCertificate", "Ingredient", "IngredientLot", "Batch", "BatchInput",
  "Shipment", "Notification", "EvidenceLink",
]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count",
  "aggregate", "groupBy", "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany",
]);

function withOrg(data: unknown, orgId: string) {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (d.organizationId !== undefined && d.organizationId !== orgId) {
      throw new AppError("TENANT_VIOLATION", "Cross-tenant write rejected");
    }
    return { ...d, organizationId: orgId };
  }
  return data;
}

/**
 * Returns a Prisma client whose every operation on tenant models is forced into
 * the given organization. Reads and writes outside the organization are impossible
 * through this client: filters are AND-ed with `organizationId`, and creates have it set.
 */
export function tenantDb(orgId: string) {
  if (!orgId) throw new AppError("TENANT_REQUIRED", "Organization context missing");
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = { ...((args ?? {}) as Record<string, unknown>) };
          if (WHERE_OPS.has(operation)) {
            const where = (a.where ?? {}) as Record<string, unknown>;
            if (where.organizationId !== undefined && where.organizationId !== orgId) {
              throw new AppError("TENANT_VIOLATION", "Cross-tenant query rejected");
            }
            a.where = { ...where, organizationId: orgId };
          }
          if (operation === "create") a.data = withOrg(a.data, orgId);
          if (operation === "createMany" || operation === "createManyAndReturn") {
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d) => withOrg(d, orgId));
          }
          if (operation === "upsert") {
            a.where = { ...((a.where ?? {}) as object), organizationId: orgId };
            a.create = withOrg(a.create, orgId);
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

type Delegate = { count(args: { where: Record<string, unknown> }): Promise<number> };

/**
 * Verifies that all referenced ids exist inside the tenant. Use before linking an
 * entity to an id received from user input (FKs alone don't enforce tenant ownership).
 */
export async function assertOwned(db: TenantDb, model: string, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (unique.length === 0) return;
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = (db as unknown as Record<string, Delegate>)[key];
  if (!delegate) throw new Error(`Unknown model ${model}`);
  const count = await delegate.count({ where: { id: { in: unique } } });
  if (count !== unique.length) throw new AppError("NOT_FOUND", `${model} not found`);
}
