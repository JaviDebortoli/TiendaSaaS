import { Injectable } from '@nestjs/common';
import { ID, TransactionalConnection } from '@vendure/core';
import { randomBytes } from 'node:crypto';
import { MercadoPagoPreference } from '../entities/mercadopago-preference.entity';
import { isUniqueViolation } from '../lib/db';

export interface IssuePreferenceInput {
  orderId: ID;
  orderCode: string;
  channelId: ID;
  accountId: ID;
  linkId: ID;
  totalWithTax: number;
  /** Hash of the inputs of the request: repeating it returns the same row. */
  idempotencyKey: string;
}

/** 16 random bytes: 128 bits, 22 characters in base64url. */
const TOKEN_BYTES = 16;

/** A registry token as the per-preference notification URL carries it. */
export const REGISTRY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * The preferences the platform issued (PRD 9.6, 9.7). The order, the store and the account of a
 * payment come from here, never from parsing the `external_reference` it carries: that string is
 * only looked up as a whole.
 */
@Injectable()
export class MercadoPagoPreferenceRegistry {
  constructor(private readonly connection: TransactionalConnection) {}

  private get rows() {
    return this.connection.rawConnection.getRepository(MercadoPagoPreference);
  }

  /**
   * Records a preference about to be created, or returns the one an identical request already
   * recorded. Written before Mercado Pago is called so a retry reuses the same identifier, which
   * keeps Mercado Pago's idempotency (same key, same body) working.
   */
  async issue(input: IssuePreferenceInput): Promise<MercadoPagoPreference> {
    const existing = await this.rows.findOneBy({ idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    try {
      return await this.rows.save(
        this.rows.create({
          ...input,
          token,
          externalReference: `${input.orderCode}-${token}`,
          preferenceId: null,
        }),
      );
    } catch (error) {
      // Two identical requests at once: the other one won, use its row.
      const winner = isUniqueViolation(error)
        ? await this.rows.findOneBy({ idempotencyKey: input.idempotencyKey })
        : null;
      if (winner) return winner;
      throw error;
    }
  }

  /** Remembers the `preference_id` Mercado Pago answered with. */
  async setPreferenceId(id: ID, preferenceId: string): Promise<void> {
    await this.rows.update({ id }, { preferenceId });
  }

  findByExternalReference(externalReference: string): Promise<MercadoPagoPreference | null> {
    return this.rows.findOne({
      where: { externalReference },
      relations: { account: true, link: true },
    });
  }

  findByToken(token: string): Promise<MercadoPagoPreference | null> {
    if (!REGISTRY_TOKEN_PATTERN.test(token)) return Promise.resolve(null);
    return this.rows.findOne({ where: { token }, relations: { account: true, link: true } });
  }

  /** The preferences issued for an order, with their accounts. */
  listForOrder(orderCode: string): Promise<MercadoPagoPreference[]> {
    return this.rows.find({ where: { orderCode }, relations: { account: true, link: true } });
  }
}
