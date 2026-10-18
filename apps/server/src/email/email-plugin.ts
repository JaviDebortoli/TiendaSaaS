import {
  defaultEmailHandlers,
  EmailPlugin,
  type EmailPluginDevModeOptions,
  type EmailPluginOptions,
} from '@vendure/email-plugin';
import path from 'node:path';
import { attentionEmailHandler } from './attention';
import { createGlobalTemplateVars, type PlatformBranding } from './branding';
import { ChannelTemplateLoader } from './channel-template-loader';

/** Emails about the account are the platform's: the account is shared by all stores (PRD 6.3). */
const ACCOUNT_EMAIL_TYPES = new Set([
  'email-verification',
  'password-reset',
  'email-address-change',
]);

/** Vendure's own templates, used for every email type the platform does not restyle. */
const vendureTemplates = path.join(
  path.dirname(require.resolve('@vendure/email-plugin/package.json')),
  'templates',
);

export interface PlatformEmailOptions {
  platform: PlatformBranding;
  /** SMTP, or dev mode (emails written to disk and shown at /mailbox). */
  delivery: Pick<EmailPluginOptions, 'transport'> | Omit<EmailPluginDevModeOptions, 'handlers'>;
  /** `<dir>/<channel code>/<type>/<template>` overrides the template for one store. */
  overridesDir?: string;
}

const handlers = defaultEmailHandlers.map((handler) =>
  ACCOUNT_EMAIL_TYPES.has(handler.type) ? handler.setFrom('{{ platformFromAddress }}') : handler,
);

/**
 * EmailPlugin configured for many stores (PRD 6.3, V9):
 * - order emails are sent in the store's name, with the store's details as template variables;
 * - account emails (verification, password reset) are sent in the platform's name, with links to
 *   the storefront the buyer came from;
 * - any store can override a template by adding a folder named after its channel code.
 */
export function createEmailPlugin(options: PlatformEmailOptions) {
  return EmailPlugin.init({
    ...options.delivery,
    handlers: [...handlers, attentionEmailHandler],
    templateLoader: new ChannelTemplateLoader(
      options.overridesDir ?? path.join(__dirname, '../../email-templates/stores'),
      [path.join(__dirname, '../../email-templates/platform'), vendureTemplates],
    ),
    globalTemplateVars: createGlobalTemplateVars(options.platform),
  } as EmailPluginOptions);
}
