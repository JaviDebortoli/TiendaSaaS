import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { EntityId } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ConnectionStatus = 'connected' | 'expiring' | 'disconnected';

/**
 * A store's linked Mercado Pago account (PRD 9.3). One account maps to one channel and the other
 * way around, enforced by the two unique indexes.
 *
 * `accessToken` and `refreshToken` hold AES-256-GCM payloads, never clear text.
 */
@Entity()
export class MercadoPagoConnection extends VendureEntity {
  constructor(input?: DeepPartial<MercadoPagoConnection>) {
    super(input);
  }

  @Index({ unique: true })
  @EntityId()
  channelId!: ID;

  /** Mercado Pago `user_id` of the seller. Identifies the store when a notification arrives. */
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
  status!: ConnectionStatus;

  /** Last renewal or revocation problem, shown to the store owner. Never contains secrets. */
  @Column({ type: 'varchar', nullable: true })
  lastError!: string | null;
}
