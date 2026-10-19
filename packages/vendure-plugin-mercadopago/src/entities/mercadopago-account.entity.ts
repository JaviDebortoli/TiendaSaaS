import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * - `connected`: the seller authorized the application and the tokens work.
 * - `expiring`: still usable, but the last renewal failed and the owner must link it again.
 * - `disconnected`: the seller revoked access from Mercado Pago. It affects every link of the account.
 * - `released`: no store uses the account any more and its tokens were deleted.
 */
export type AccountStatus = 'connected' | 'expiring' | 'disconnected' | 'released';

/**
 * A Mercado Pago account that authorized the application (PRD 9.3). One row per account, whatever
 * stores have used it: the tokens live here and only here.
 *
 * `accessToken` and `refreshToken` hold AES-256-GCM payloads bound to the account, never clear
 * text. They are empty strings once the account is `disconnected` or `released`.
 */
@Entity()
export class MercadoPagoAccount extends VendureEntity {
  constructor(input?: DeepPartial<MercadoPagoAccount>) {
    super(input);
  }

  /** Mercado Pago `user_id` of the seller. Identifies the account when a notification arrives. */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  mpUserId!: string;

  @Column({ type: 'text' })
  accessToken!: string;

  @Column({ type: 'text' })
  refreshToken!: string;

  @Column({ type: 'varchar', nullable: true })
  publicKey!: string | null;

  @Column({ type: Date })
  expiresAt!: Date;

  @Column({ type: 'varchar', nullable: true })
  scope!: string | null;

  @Column({ type: 'varchar' })
  status!: AccountStatus;

  /** Last renewal or revocation problem, shown to the store owner. Never contains secrets. */
  @Column({ type: 'varchar', nullable: true })
  lastError!: string | null;
}
