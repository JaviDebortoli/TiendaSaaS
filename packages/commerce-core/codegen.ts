import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Generates typed documents from the committed schema snapshot, so it runs offline.
 * `Money` is an integer number of cents (PRD 16.6).
 */
const config: CodegenConfig = {
  schema: './schema.shop.graphql',
  documents: ['src/**/*.ts', '!src/gql/**'],
  ignoreNoDocuments: true,
  generates: {
    './src/gql/': {
      preset: 'client',
      presetConfig: { fragmentMasking: false },
      config: {
        scalars: {
          Money: 'number',
          DateTime: 'string',
          JSON: 'unknown',
          Upload: 'unknown',
        },
        enumsAsTypes: true,
        useTypeImports: true,
      },
    },
  },
};

export default config;
