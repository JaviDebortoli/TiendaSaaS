import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { MercadoPagoAccount } from './mercadopago-account.entity';
import { MercadoPagoChannelLink } from './mercadopago-channel-link.entity';

/**
 * A Mercado Pago preference the platform issued for an order (PRD 9.6, 9.7). A payment may settle
 * an order only if it belongs to one of these: that is what keeps somebody who holds an account
 * (for example after a transfer between stores) from paying another store's unpaid order with a
 * payment of their own that merely repeats its code.
 *
 * The row is written before Mercado Pago is called, so a retry of the same request finds it and
 * reuses its identifier; `preferenceId` is filled in with Mercado Pago's answer.
 */
@Entity()
export class MercadoPagoPreference extends VendureEntity {
  constructor(input?: DeepPartial<MercadoPagoPreference>) {
    super(input);
  }

  /**
   * Random identifier of at least 128 bits (base64url). It is the suffix of `externalReference`
   * and what the per-preference `notification_url` carries.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  token!: string;

  /** What the preference sends to Mercado Pago as `external_reference`: `<order code>-<token>`. */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  externalReference!: string;

  /** Hash of the inputs of the request, so repeating it reuses this row (PRD 9.6). */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  idempotencyKey!: string;

  @Index()
  @EntityId()
  orderId!: ID;

  @Column({ type: 'varchar' })
  orderCode!: string;

  @Index()
  @EntityId()
  channelId!: ID;

  /** The account whose token created the preference: the one that has to collect its payments. */
  @ManyToOne(() => MercadoPagoAccount, { onDelete: 'RESTRICT' })
  account!: MercadoPagoAccount;

  @EntityId()
  accountId!: ID;

  @ManyToOne(() => MercadoPagoChannelLink, { onDelete: 'RESTRICT' })
  link!: MercadoPagoChannelLink;

  @EntityId()
  linkId!: ID;

  /** The order total, in minor units, when the preference was issued. */
  @Column({ type: 'int' })
  totalWithTax!: number;

  /** The `preference_id` Mercado Pago answered with. Null until it answered. */
  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  preferenceId!: string | null;
}
