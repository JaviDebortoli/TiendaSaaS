import { Injectable } from '@nestjs/common';
import {
  Administrator,
  Channel,
  EventBus,
  ID,
  Logger,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  VendureEvent,
} from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';
import { MercadoPagoAttentionEvent, type AttentionReason } from 'vendure-plugin-mercadopago';

const loggerCtx = 'Attention';
const SUPER_ADMIN_ROLE_CODE = '__super_admin_role__';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the platform can say about each situation, in the language of the store owners. */
const TEXTS: Record<AttentionReason, { title: string; message: string; action: string }> = {
  token_renewal_failed: {
    title: 'No pudimos renovar la conexión con Mercado Pago',
    message:
      'La conexión de tu tienda con Mercado Pago está por vencer y no se pudo renovar automáticamente.',
    action:
      'Entrá al panel, abrí Ajustes › Mercado Pago y volvé a vincular tu cuenta antes de que venza para no dejar de cobrar.',
  },
  account_disconnected: {
    title: 'Mercado Pago quedó desconectada',
    message:
      'Se revocó el acceso a la cuenta de Mercado Pago de la tienda, y la cuenta quedó retirada de la tienda. Mientras tanto, los compradores no pueden pagar con Mercado Pago.',
    action:
      'Para volver a cobrar, entrá al panel, abrí Ajustes › Mercado Pago y vinculá una cuenta (la misma, volviendo a autorizarla, u otra). Mientras la cuenta revocada no vuelva a autorizarse, los reembolsos de sus ventas anteriores hacelos desde el panel de Mercado Pago.',
  },
  amount_mismatch: {
    title: 'Un pago aprobado no coincide con el pedido',
    message:
      'Mercado Pago aprobó un pago cuyo monto no coincide con el total del pedido (por ejemplo, porque el carrito cambió mientras el cliente pagaba). No se agregó al pedido.',
    action: 'Revisá el pedido y, si corresponde, reembolsá el pago desde Mercado Pago.',
  },
  order_not_payable: {
    title: 'Llegó un pago aprobado para un pedido que ya no se puede pagar',
    message:
      'Mercado Pago aprobó un pago pero el pedido ya estaba pagado o cambió de estado. No se agregó al pedido.',
    action: 'Revisá el pedido y, si cobraste de más, reembolsá el pago sobrante.',
  },
  payment_reversed: {
    title: 'Un pago fue devuelto o contracargado',
    message:
      'Mercado Pago informó que un pago de la tienda fue devuelto, disputado o contracargado.',
    action: 'Revisá el pedido en el panel. El estado del pedido no se cambia automáticamente.',
  },
  collector_mismatch: {
    title: 'Un pago aprobado no se pudo asignar a la cuenta que lo cobró',
    message:
      'Mercado Pago aprobó un pago pero informa que lo cobró una cuenta distinta de la que se consultó. Por seguridad no se agregó al pedido.',
    action:
      'Revisá el pago en Mercado Pago. Si es legítimo, reembolsalo desde ahí o avisá a la plataforma para resolverlo.',
  },
  collector_missing: {
    title: 'Mercado Pago no informó qué cuenta cobró un pago aprobado',
    message:
      'Mercado Pago aprobó un pago pero no indicó qué cuenta lo cobró, así que no se pudo confirmar. Por seguridad no se agregó al pedido.',
    action:
      'Revisá el pago en Mercado Pago. Si es legítimo, reembolsalo desde ahí o avisá a la plataforma para resolverlo.',
  },
  link_released: {
    title: 'Se liberó una cuenta de Mercado Pago anterior de tu tienda',
    message:
      'Pasó el plazo para reembolsar las ventas cobradas con una cuenta de Mercado Pago que la tienda dejó de usar. Desde ahora esa cuenta ya no se usa para esta tienda y sus ventas no se pueden reembolsar desde el panel.',
    action:
      'Si necesitás reembolsar una venta cobrada con esa cuenta, hacelo desde el panel de Mercado Pago de esa cuenta.',
  },
  released_link_payment: {
    title: 'Llegó un pago aprobado para una cuenta ya liberada',
    message:
      'Llegó un pago aprobado de una cuenta que ya se había liberado de la tienda. Se verificó y se agregó al pedido, pero la regla de liberación debería haberlo evitado.',
    action: 'Revisá los plazos de liberación de cuentas y el pedido indicado.',
  },
  unverifiable_payment: {
    title: 'No se pudo verificar una notificación de Mercado Pago',
    message:
      'Llegó una notificación de pago de una cuenta que no se conoce o que ya no tiene credenciales, así que no se pudo consultar el pago.',
    action: 'Revisá si la cuenta corresponde a una tienda y si hay que volver a vincularla.',
  },
};

/** Reasons that also concern whoever runs the platform, not only the store. */
const PLATFORM_REASONS = new Set<AttentionReason>([
  'token_renewal_failed',
  'account_disconnected',
  'collector_mismatch',
  'collector_missing',
  'released_link_payment',
  'unverifiable_payment',
]);

/** Published for the email plugin, which needs the request context of the store. */
export class StoreAttentionEmailEvent extends VendureEvent {
  constructor(
    readonly ctx: RequestContext,
    readonly attention: MercadoPagoAttentionEvent,
    readonly recipients: string[],
    readonly bcc: string[],
  ) {
    super();
  }
}

export const attentionEmailHandler = new EmailEventListener('mercadopago-attention')
  .on(StoreAttentionEmailEvent)
  .setRecipient((event) => event.recipients.join(', '))
  .setFrom('{{ platformFromAddress }}')
  .setOptionalAddressFields((event) => ({ bcc: event.bcc.join(', ') || undefined }))
  .setSubject(
    'Atención en {{#if platformOnly}}{{ platformName }}{{else}}{{ storeName }}{{/if}}: {{ title }}',
  )
  .setTemplateVars((event) => ({
    ...TEXTS[event.attention.reason],
    // An event no store can be told about (an account nobody uses) is for the platform alone.
    platformOnly: event.attention.channelId === null,
    orderCode: event.attention.details.orderCode,
    mpPaymentId: event.attention.details.mpPaymentId,
    detail: event.attention.details.message,
  }));

/**
 * Tells the people who can act when something needs attention (PRD 9.4, 9.8): the owners of the
 * store, and for connection problems also the superadmin. The Mercado Pago plugin only publishes
 * the event; deciding who to tell, and how, is the application's job.
 */
@Injectable()
export class AttentionNotifier {
  private started = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly connection: TransactionalConnection,
    private readonly requestContextService: RequestContextService,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.eventBus.ofType(MercadoPagoAttentionEvent).subscribe((event) => {
      this.notify(event).catch((error) =>
        Logger.error(
          `Could not send the attention email: ${error instanceof Error ? error.message : String(error)}`,
          loggerCtx,
        ),
      );
    });
  }

  async notify(event: MercadoPagoAttentionEvent): Promise<void> {
    const ctx = await this.contextFor(event.channelId);
    const owners = event.channelId === null ? [] : await this.administratorEmails(event.channelId);
    const platform = PLATFORM_REASONS.has(event.reason) ? await this.platformEmails() : [];
    const recipients = owners.length > 0 ? owners : platform;
    if (recipients.length === 0) {
      Logger.warn(
        `Nobody to tell about "${event.reason}" in channel ${event.channelId}`,
        loggerCtx,
      );
      return;
    }
    const bcc = owners.length > 0 ? platform.filter((email) => !owners.includes(email)) : [];
    await this.eventBus.publish(new StoreAttentionEmailEvent(ctx, event, recipients, bcc));
  }

  private async contextFor(channelId: ID | null): Promise<RequestContext> {
    // No store to speak about: the default channel, which is where the platform's own mail lives.
    if (channelId === null) return this.requestContextService.create({ apiType: 'admin' });
    const channel = await this.connection.rawConnection
      .getRepository(Channel)
      .findOneByOrFail({ id: channelId });
    return this.requestContextService.create({ apiType: 'admin', channelOrToken: channel.token });
  }

  /** Administrators that have a role in this channel (the owners of the store). */
  private async administratorEmails(channelId: ID): Promise<string[]> {
    const admins = await this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoin('admin.user', 'user')
      .innerJoin('user.roles', 'role')
      .innerJoin('role.channels', 'channel')
      .where('channel.id = :channelId', { channelId })
      .andWhere('role.code != :superAdmin', { superAdmin: SUPER_ADMIN_ROLE_CODE })
      .getMany();
    return [...new Set(admins.map((a) => a.emailAddress).filter((e) => EMAIL.test(e)))];
  }

  private async platformEmails(): Promise<string[]> {
    const admins = await this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoin('admin.user', 'user')
      .innerJoin('user.roles', 'role')
      .where('role.code = :superAdmin', { superAdmin: SUPER_ADMIN_ROLE_CODE })
      .getMany();
    const emails = admins.map((a) => a.emailAddress).filter((e) => EMAIL.test(e));
    // Optional extra address for platform alerts (PLATFORM_ALERT_EMAIL), for deployments whose
    // superadmin user name is not an email address.
    const extra = process.env.PLATFORM_ALERT_EMAIL?.trim();
    if (extra && EMAIL.test(extra)) emails.push(extra);
    return [...new Set(emails)];
  }
}
