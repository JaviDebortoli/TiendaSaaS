import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const files = sourceFiles(join(root, 'src')).filter(
  (file) => !file.includes(`${join('src', 'gql')}`),
);

/**
 * commerce-core can run in the browser and must stay free of secrets and of the payment SDK
 * (PRD 10.2, 16.2): the payment happens on the server and on the Mercado Pago page.
 */
describe('commerce-core stays free of secrets and the Mercado Pago SDK', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  it('does not depend on the mercadopago SDK or on server packages', () => {
    const names = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
    expect(names.filter((n) => /mercadopago|^@vendure\//.test(n))).toEqual([]);
  });

  it('never imports the SDK, Node-only modules or reads the environment', () => {
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const problems: string[] = [];
      if (/from ['"]mercadopago['"]/.test(text)) problems.push('imports mercadopago');
      if (/from ['"]node:/.test(text)) problems.push('imports a node: module');
      if (/\bprocess\.env\b/.test(text)) problems.push('reads process.env');
      if (/\b(access_token|client_secret|MP_[A-Z_]+)\b/.test(text))
        problems.push('mentions a credential');
      return problems.map((p) => `${file}: ${p}`);
    });
    expect(offenders).toEqual([]);
  });

  it('never talks to the Admin API', () => {
    const offenders = files.filter((file) => /admin-api/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('has an empty list of Admin operations in its documents', () => {
    const generated = readFileSync(join(root, 'src/gql/gql.ts'), 'utf8');
    expect(generated).not.toMatch(
      /startMercadoPagoConnection|disconnectMercadoPago|provisionStore/,
    );
  });
});
