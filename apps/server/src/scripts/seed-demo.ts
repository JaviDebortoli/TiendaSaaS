import { INestApplicationContext } from '@nestjs/common';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import {
  Channel,
  LanguageCode,
  ProductService,
  ProductVariantService,
  RequestContext,
  RequestContextService,
  TaxCategoryService,
  TransactionalConnection,
} from '@vendure/core';
import { env } from '../env';
import { StoreProvisioningService } from '../platform/provisioning.service';
import { runScript, superAdminContext, withApp } from './app';

interface DemoProduct {
  name: string;
  description: string;
  /** Price in ARS, taxes included. */
  price: number;
}

interface DemoStore {
  name: string;
  code: string;
  token: string;
  ownerEmail: string;
  products: DemoProduct[];
}

/** Fixed, non-secret tokens so the reference storefront works out of the box. */
const DEMO_STORES: DemoStore[] = [
  {
    name: 'Panadería Don Juan',
    code: 'panaderia-don-juan',
    token: 'demo-panaderia',
    ownerEmail: 'dueno@panaderia-demo.test',
    products: [
      { name: 'Pan de campo', description: 'Pan de campo de masa madre, 1 kg.', price: 1800 },
      {
        name: 'Medialunas x6',
        description: 'Medialunas de manteca recién horneadas.',
        price: 4500,
      },
      {
        name: 'Torta de ricota',
        description: 'Torta de ricota casera para 8 porciones.',
        price: 12900,
      },
      {
        name: 'Alfajores x12',
        description: 'Alfajores de maicena con dulce de leche.',
        price: 9800,
      },
      { name: 'Facturas x12', description: 'Docena surtida de facturas.', price: 7200.5 },
    ],
  },
  {
    name: 'Librería Luna',
    code: 'libreria-luna',
    token: 'demo-libreria',
    ownerEmail: 'dueno@libreria-demo.test',
    products: [
      { name: 'Cuaderno rayado A5', description: 'Tapa dura, 96 hojas.', price: 3200 },
      { name: 'Lapicera azul', description: 'Tinta gel, trazo fino.', price: 850 },
      { name: 'El viaje (novela)', description: 'Novela de autor argentino.', price: 15500 },
      { name: 'Mochila escolar', description: 'Mochila resistente de 20 litros.', price: 28000 },
      { name: 'Set de acuarelas', description: '24 colores con pincel.', price: 11400.9 },
    ],
  },
];

const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

async function seedProducts(
  app: INestApplicationContext,
  ctx: RequestContext,
  store: DemoStore,
): Promise<number> {
  const products = app.get(ProductService);
  const variants = app.get(ProductVariantService);
  const taxCategory = (await app.get(TaxCategoryService).findAll(ctx, { take: 1 })).items[0];
  const existing = await products.findAll(ctx, { take: 1 });
  if (existing.totalItems > 0) return 0; // already seeded

  for (const item of store.products) {
    const product = await products.create(ctx, {
      enabled: true,
      translations: [
        {
          languageCode: LanguageCode.es,
          name: item.name,
          slug: slugify(item.name),
          description: item.description,
        },
      ],
    });
    await variants.create(ctx, [
      {
        productId: product.id,
        sku: `${store.code}-${slugify(item.name)}`.toUpperCase(),
        price: Math.round(item.price * 100),
        stockOnHand: 50,
        trackInventory: GlobalFlag.FALSE,
        taxCategoryId: taxCategory?.id,
        translations: [{ languageCode: LanguageCode.es, name: item.name }],
      },
    ]);
  }
  return store.products.length;
}

runScript(async () => {
  if (!env.isDev && process.env.SEED_DEMO_FORCE !== 'true') {
    throw new Error(
      'seed-demo creates stores with known tokens and a shared password. It only runs with APP_ENV=dev (or SEED_DEMO_FORCE=true).',
    );
  }
  const password = process.env.DEMO_OWNER_PASSWORD || 'demo-password-123';

  const summary = await withApp(async (app) => {
    const requestContexts = app.get(RequestContextService);
    const adminCtx = await superAdminContext(app);
    const channels = app.get(TransactionalConnection).rawConnection.getRepository(Channel);
    const created: {
      code: string;
      token: string;
      owner: string;
      products: number;
      provisioned: boolean;
    }[] = [];

    for (const store of DEMO_STORES) {
      const provisioned = !(await channels.findOneBy({ code: store.code }));
      if (provisioned) {
        await app.get(StoreProvisioningService).provision(adminCtx, {
          name: store.name,
          code: store.code,
          token: store.token,
          ownerEmail: store.ownerEmail,
          ownerFirstName: 'Dueño',
          ownerLastName: store.name,
          ownerPassword: password,
          storefrontUrl: process.env.DEMO_STOREFRONT_URL,
          flatRate: 150000,
          flatRateMinimum: 0,
        });
      }
      const storeCtx = await requestContexts.create({
        apiType: 'admin',
        channelOrToken: store.token,
      });
      const products = await seedProducts(app, storeCtx, store);
      created.push({
        code: store.code,
        token: store.token,
        owner: store.ownerEmail,
        products,
        provisioned,
      });
    }
    return created;
  });

  console.table(summary);
  console.log(`Owner password for both stores: ${password}`);
  console.log('Link each store to Mercado Pago from its dashboard (see README).');
});
