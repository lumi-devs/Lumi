// @ember/sdk — the stable surface addons build against. Addons import their base
// classes, builders, permission enums, card factories, and wire contracts from
// here so they never reach into @ember/core internals (the fragile #core/* path
// that broke before). Re-exports the package root, NOT deep paths — so addons are
// insulated from internal reorganisation.

export * from "@ember/core";
