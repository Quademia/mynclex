// mynclex/test/stubs/server-only.ts
//
// No-op stand-in for the `server-only` package under Vitest.
//
// `import 'server-only'` is the repo convention for marking a module as
// server-side (lib/payments/activate.ts, entitlements.ts, lib/curriculum/
// unit-body.ts and others use it). It is NOT in node_modules — Next.js
// resolves it through its own build alias, where its whole job is to throw
// if a Client Component ever imports the module.
//
// That means the marker works in the app but cannot resolve under Vitest, so
// any server module carrying it was untestable. No existing one had tests,
// which is why this never surfaced until lib/practice/cat/turn.ts.
//
// Aliased in vitest.config.ts. Keeping the marker is deliberate: dropping it
// to make a module testable would trade a real safety guarantee for test
// convenience.
export {};
