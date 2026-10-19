import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { MercadoPagoAccount } from './mercadopago-account.entity';

/**
 * - `active`: the store sells with this account. At most one per store and one per account.
 * - `retired`: the store stopped selling with it, but its past sales can still be refunded and its
 *   pending payments are still processed.
 * - `released`: nothing is owed to it any more; it is only history.
 */
export type LinkStatus = 'active' | 'retired' | 'released';

/**
 * Which stores use, or used, which account. The two partial unique indexes are the rule "a store
 * sells with one account and an account sells for one store": they live in the database so no race
 * between two requests can break them. `retired` and `released` rows are not in the indexes, so
 * they never block anything.
 */
@Entity()
@Index('IDX_mp_link_one_active_per_channel', ['channelId'], {
  unique: true,
  where: `"status" = 'active'`,
})
@Index('IDX_mp_link_one_active_per_account', ['accountId'], {
  unique: true,
  where: `"status" = 'active'`,
})
export class MercadoPagoChannelLink extends VendureEntity {
  constructor(input?: DeepPartial<MercadoPagoChannelLink>) {
    super(input);
  }

  @Index()
  @EntityId()
  channelId!: ID;

  @ManyToOne(() => MercadoPagoAccount, { onDelete: 'RESTRICT' })
  account!: MercadoPagoAccount;

  @EntityId()
  accountId!: ID;

  @Column({ type: 'varchar' })
  status!: LinkStatus;

  @Column({ type: Date })
  linkedAt!: Date;

  @Column({ type: Date, nullable: true })
  retiredAt!: Date | null;

  @Column({ type: Date, nullable: true })
  releasedAt!: Date | null;
}
