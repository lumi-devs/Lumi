// @lumi/contracts - Shared wire types and contract definitions.


// NOTE: extensionless relative specifiers here (not "./rpc.js" etc.) are
// deliberate, not an oversight — this repo's tsconfig.base.json configures
// `"moduleResolution": "Bundler"`, which resolves either style identically
// for Bun/tsc. Next.js's bundlers (apps/dashboard), however, only resolve
// this package's source correctly without an explicit ".js" extension: with
// it, both Turbopack and webpack look for a literal sibling "rpc.js" file
// and fail ("Module not found") since only "rpc.ts" exists on disk. Keep
// this package's own internal imports extensionless so every consumer
// (Bun, tsc, and Next's bundlers) agrees.
export * from "./rpc";
export * from "./bus";
export * from "./config";
export * from "./manifest";
