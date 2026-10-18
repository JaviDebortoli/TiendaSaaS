import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Refreshes `schema.shop.graphql` from a running server (introspection is enabled with
 * APP_ENV=dev). Run it when the Shop API changes, then run `npm run codegen`.
 * The default channel is used on purpose: the schema is the same for every channel.
 */
const config: CodegenConfig = {
  schema: process.env.VENDURE_SHOP_API_URL ?? 'http://localhost:3000/shop-api',
  generates: {
    'schema.shop.graphql': { plugins: ['schema-ast'], config: { includeDirectives: false } },
  },
};

export default config;
