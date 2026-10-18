import { Permission } from '@vendure/core';

/**
 * What the owner of a store may do inside the dashboard. It excludes everything that spans
 * channels or administers the platform: channels, administrators, roles, global settings.
 * `ManageMercadoPago` is the custom permission of the Mercado Pago plugin.
 */
export const STORE_OWNER_PERMISSIONS: string[] = [
  // Catalogue
  Permission.CreateCatalog,
  Permission.ReadCatalog,
  Permission.UpdateCatalog,
  Permission.DeleteCatalog,
  Permission.CreateProduct,
  Permission.ReadProduct,
  Permission.UpdateProduct,
  Permission.DeleteProduct,
  Permission.CreateFacet,
  Permission.ReadFacet,
  Permission.UpdateFacet,
  Permission.DeleteFacet,
  Permission.CreateCollection,
  Permission.ReadCollection,
  Permission.UpdateCollection,
  Permission.DeleteCollection,
  Permission.CreateAsset,
  Permission.ReadAsset,
  Permission.UpdateAsset,
  Permission.DeleteAsset,
  Permission.CreateTag,
  Permission.ReadTag,
  Permission.UpdateTag,
  Permission.DeleteTag,
  Permission.CreatePromotion,
  Permission.ReadPromotion,
  Permission.UpdatePromotion,
  Permission.DeletePromotion,
  // Orders and customers (refunds and cancellations are part of UpdateOrder)
  Permission.CreateOrder,
  Permission.ReadOrder,
  Permission.UpdateOrder,
  Permission.CreateCustomer,
  Permission.ReadCustomer,
  Permission.UpdateCustomer,
  Permission.ReadCustomerGroup,
  // The store's own settings: delivery and stock. The payment method is read-only.
  Permission.ReadShippingMethod,
  Permission.UpdateShippingMethod,
  Permission.ReadPaymentMethod,
  Permission.ReadStockLocation,
  Permission.UpdateStockLocation,
  // Reference data the forms need. ReadSettings, ReadChannel and ReadSeller are left out on
  // purpose: the `channels` and `sellers` queries are not filtered by channel, so they would list
  // the name, tax id, contact and token of every other store. The dashboard learns the user's own
  // channel from `me { channels }` and `activeChannel`, which need no permission. Store details
  // are edited by the superadmin.
  Permission.ReadZone,
  Permission.ReadCountry,
  Permission.ReadTaxCategory,
  Permission.ReadTaxRate,
  // Mercado Pago: link, unlink and view the account of this store
  'ManageMercadoPago',
];
