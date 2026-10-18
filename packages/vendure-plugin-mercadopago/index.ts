// Entry point for tooling that reads this package as source when it is linked into a workspace
// (the Vendure dashboard build finds the plugin and its dashboard extension through it).
// The compiled entry point is dist/index.js, see package.json.
export * from './src';
