#!/usr/bin/env node
// Generates a PostgreSQL "init" migration from prisma/schema.prisma using the
// official Prisma schema WASM (DMMF), following Prisma Migrate's naming conventions.
//
// Why this exists: the build sandbox used to create this project could not download
// Prisma's native schema-engine binary (binaries.prisma.sh was blocked). In a normal
// environment, prefer `npx prisma migrate dev`. CI verifies there is no drift with
// `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`.
//
// Usage: node scripts/generate-migration-sql.mjs > prisma/migrations/<ts>_init/migration.sql
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wasm = require("@prisma/prisma-schema-wasm");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const dm = JSON.parse(wasm.get_dmmf(JSON.stringify({ prismaSchema: [["schema.prisma", schema]] }))).datamodel;

const q = (s) => `"${s}"`;
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const enumNames = new Set(dm.enums.map((e) => e.name));

function columnType(f) {
  let t;
  if (enumNames.has(f.type)) t = q(f.type);
  else {
    switch (f.type) {
      case "String": t = "TEXT"; break;
      case "Int": t = "INTEGER"; break;
      case "BigInt": t = "BIGINT"; break;
      case "Float": t = "DOUBLE PRECISION"; break;
      case "Decimal": t = "DECIMAL(65,30)"; break;
      case "Boolean": t = "BOOLEAN"; break;
      case "DateTime": t = "TIMESTAMP(3)"; break;
      case "Json": t = "JSONB"; break;
      case "Bytes": t = "BYTEA"; break;
      default: throw new Error(`Unsupported type ${f.type}`);
    }
  }
  return f.isList ? `${t}[]` : t;
}

function defaultClause(f) {
  if (!f.hasDefaultValue || f.default === undefined) return "";
  const d = f.default;
  if (typeof d === "object" && d !== null && "name" in d) {
    if (d.name === "now") return " DEFAULT CURRENT_TIMESTAMP";
    if (d.name === "autoincrement") throw new Error("autoincrement not supported by generator");
    return ""; // cuid()/uuid() are generated client-side
  }
  if (typeof d === "boolean" || typeof d === "number") return ` DEFAULT ${d}`;
  return ` DEFAULT ${lit(d)}`;
}

const out = [];
for (const e of dm.enums) {
  out.push(`-- CreateEnum\nCREATE TYPE ${q(e.name)} AS ENUM (${e.values.map((v) => lit(v.name)).join(", ")});\n`);
}

const indexSql = [];
const fkSql = [];
for (const m of dm.models) {
  const cols = [];
  for (const f of m.fields) {
    if (f.kind === "object") continue;
    const notNull = f.isRequired && !f.isList ? " NOT NULL" : "";
    cols.push(`    ${q(f.name)} ${columnType(f)}${notNull}${defaultClause(f)}`);
  }
  const pkFields = m.primaryKey ? m.primaryKey.fields : m.fields.filter((f) => f.isId).map((f) => f.name);
  cols.push(`    CONSTRAINT ${q(`${m.name}_pkey`)} PRIMARY KEY (${pkFields.map(q).join(",")})`);
  out.push(`-- CreateTable\nCREATE TABLE ${q(m.name)} (\n${cols.join(",\n")}\n);\n`);

  for (const idx of dm.indexes.filter((i) => i.model === m.name)) {
    const fields = idx.fields.map((x) => x.name);
    if (idx.type === "unique") {
      indexSql.push(`-- CreateIndex\nCREATE UNIQUE INDEX ${q(idx.dbName ?? `${m.name}_${fields.join("_")}_key`)} ON ${q(m.name)}(${fields.map(q).join(", ")});\n`);
    } else if (idx.type === "normal") {
      indexSql.push(`-- CreateIndex\nCREATE INDEX ${q(idx.dbName ?? `${m.name}_${fields.join("_")}_idx`)} ON ${q(m.name)}(${fields.map(q).join(", ")});\n`);
    }
  }

  for (const f of m.fields) {
    if (f.kind !== "object" || !f.relationFromFields?.length) continue;
    const from = f.relationFromFields;
    const optional = from.some((n) => !m.fields.find((x) => x.name === n).isRequired);
    const onDelete = (f.relationOnDelete ?? (optional ? "SetNull" : "Restrict"))
      .replace("SetNull", "SET NULL").replace("NoAction", "NO ACTION").replace("SetDefault", "SET DEFAULT").toUpperCase();
    fkSql.push(
      `-- AddForeignKey\nALTER TABLE ${q(m.name)} ADD CONSTRAINT ${q(`${m.name}_${from.join("_")}_fkey`)} FOREIGN KEY (${from.map(q).join(", ")}) REFERENCES ${q(f.type)}(${f.relationToFields.map(q).join(", ")}) ON DELETE ${onDelete} ON UPDATE CASCADE;\n`,
    );
  }
}

process.stdout.write([...out, ...indexSql, ...fkSql].join("\n"));
