import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * Server-side record of one OAuth authorization attempt (PRD 9.2, 11): the random `state` that
 * travels through Mercado Pago, the channel it belongs to and the PKCE code verifier.
 * Short lived and single use.
 */
@Entity()
export class MercadoPagoOAuthState extends VendureEntity {
  constructor(input?: DeepPartial<MercadoPagoOAuthState>) {
    super(input);
  }

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  state!: string;

  @EntityId()
  channelId!: ID;

  /** AES-256-GCM payload of the PKCE code verifier, bound to `state`. */
  @Column({ type: 'text' })
  codeVerifier!: string;

  @Column({ type: Date })
  expiresAt!: Date;

  /** Set atomically the first time the state is used. A used state is never accepted again. */
  @Column({ type: Date, nullable: true })
  consumedAt!: Date | null;
}
