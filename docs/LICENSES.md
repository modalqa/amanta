# Third-party license review (2026-10-28)

Checked with `license-checker-rseidelsohn --production`. The allow-list is enforced in CI by `npm run licenses:check`. This is not a legal opinion: confirm with counsel before you distribute.

## Direct runtime dependencies

| Package | Version | License |
|---|---|---|
| next, react, react-dom | 16.4.3, 19.3.1 | MIT |
| @prisma/client, @prisma/adapter-pg | 7.10.1 | Apache-2.0 |
| pg | 8.x | MIT |
| pg-boss | 12.38.0 | MIT |
| @aws-sdk/client-s3 | 3.x | Apache-2.0 |
| zod | 4.6.7 | MIT. ≥ 4.6.6 fixes GHSA-mrhx-c7xc-m3w5. |
| @node-rs/argon2 | 2.2.2 | MIT |
| pdfkit | 0.20.2 | MIT |
| file-type | 22.2.0 | MIT |
| unpdf | 1.9.1 | MIT. Bundles pdf.js, which is Apache-2.0. |
| mammoth | 1.13.0 | BSD-2-Clause |
| exceljs | 4.4.0 | MIT. Its `uuid` dependency is overridden to ^11.1.1. |
| dotenv, server-only | n/a | BSD-2-Clause, MIT |

## Items needing attention

| Package | License | Why it's present | Assessment |
|---|---|---|---|
| `@img/sharp-libvips-*` | LGPL-3.0-or-later | Optional dependency of `next` (`sharp`) for image optimization | Dynamically linked and unmodified. This is the usual acceptable use. Ship the license notice if you distribute images. |
| `elkjs` | EPL-2.0 | `prisma` CLI → Prisma Studio (dev or tooling only) | Not in the web runtime image. Used unmodified in the worker/tools image. |
| `jszip` | MIT OR GPL-3.0 | exceljs | Used under MIT. |
| `caniuse-lite` | CC-BY-4.0 | Build tooling data | Attribution license. Fine. |
| `buffers@0.1.1` | No license field (historically MIT/X11) | exceljs → unzipper | Excluded from the automated check. Review manually. |

## Infrastructure

* PostgreSQL: PostgreSQL License (permissive).
* SeaweedFS: Apache-2.0.
* MinIO is **not** used. It is AGPL-3.0, and its community edition is no longer distributed as binaries or images (reported 2025–2026).
* Playwright and @playwright/test (Apache-2.0), Vitest (MIT), ESLint (MIT), TypeScript (Apache-2.0) are development only.

## Excluded on purpose

The reverse-engineering tool REA (`rea-agents`, MIT) was used only for research and is **not** a dependency. Its optional bundled components include GPL and LGPL tooling (for example GDB, Unicorn and Frida integrations).
