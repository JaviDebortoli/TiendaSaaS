import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * - `recorded`: a non-settling status was seen (pending, rejected, ...). Can still be settled later.
 * - `processing`: a worker is adding the payment to the order right now.
 * - `settled`: the payment was added to the order.
 * - `needs_review`: money was taken but the order could not be settled automatically
 *   (amount mismatch, order no longer payable). A person decides.
 */
export type ClaimStatus = 'recorded' | 'processing' | 'settled' | 'needs_review';

/**
 * One row per Mercado Pago payment id. The unique index is what makes webhook processing
 * idempotent even when duplicate notifications are handled concurrently by several workers.
 */
@Entity()
export class MercadoPagoPaymentClaim extends VendureEntity {
  constructor(input?: DeepPartial<MercadoPagoPaymentClaim>) {
    super(input);
  }

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  mpPaymentId!: string;

  @EntityId()
  channelId!: ID;

  @Column({ type: 'varchar' })
  orderCode!: string;

  @Column({ type: 'varchar' })
  status!: ClaimStatus;

  /** Last Mercado Pago payment status seen (`approved`, `pending`, ...). */
  @Column({ type: 'varchar', nullable: true })
  lastStatus!: string | null;

  @Column({ type: Date })
  claimedAt!: Date;

  @Column({ type: 'varchar', nullable: true })
  note!: string | null;
}
