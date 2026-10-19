import { Inject, Injectable } from '@nestjs/common';
import {
  EventBus,
  ID,
  Logger,
  Payment,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { In } from 'typeorm';
import { loggerCtx, MP_PLUGIN_OPTIONS } from '../constants';
import { MercadoPagoAccount } from '../entities/mercadopago-account.entity';
import { MercadoPagoChannelLink } from '../entities/mercadopago-channel-link.entity';
import { MercadoPagoAttentionEvent } from '../events';
import type { ResolvedMercadoPagoOptions } from '../types';
import { LinkWithAccount, MercadoPagoConnectionService } from './connection.service';

const DAY_MS = 86_400_000;

/** What the dashboard and the superadmin tools show about a link. */
export interface LinkSummary {
  id: ID;
  channelId: ID;
  mpUserId: string;
  status: LinkWithAccount['status'];
  accountStatus: MercadoPagoAccount['status'];
  linkedAt: Date;
  retiredAt: Date | null;
  releasedAt: Date | null;
  /** When a `retired` link will be released if no new payment arrives. Null otherwise. */
  estimatedReleaseAt: Date | null;
}

/**
 * Ends the usefulness of an account for a store (PRD 9.4). A retired link keeps the account's
 * tokens alive so past sales can be refunded; once nothing can be refunded any more the link is
 * released, and an account nobody uses loses its tokens.
 */
@Injectable()
export class MercadoPagoReleaseService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly connections: MercadoPagoConnectionService,
    private readonly eventBus: EventBus,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
  ) {}

  private get links() {
    return this.connection.rawConnection.getRepository(MercadoPagoChannelLink);
  }

  /**
   * The payments Vendure holds as settled for this link: the store's own orders, stamped with the
   * link's account. (`metadata` is JSON text; the stamp is `"mpAccountUserId":"<id>"`.)
   */
  private settledPayments(link: LinkWithAccount) {
    // Only digits can reach the LIKE pattern, so it can never contain a wildcard.
    const stamp = /^\d{1,20}$/.test(link.account.mpUserId)
      ? `%"mpAccountUserId":"${link.account.mpUserId}"%`
      : null;
    const query = this.connection.rawConnection
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .innerJoin('payment.order', 'order')
      .innerJoin('order.channels', 'channel')
      .where('channel.id = :channelId', { channelId: link.channelId })
      .andWhere('payment.state = :state', { state: 'Settled' })
      // No stamp, no payments: a nonsensical account id must not match everything.
      .andWhere(stamp ? 'payment.metadata LIKE :stamp' : '1 = 0', stamp ? { stamp } : {});
    return query;
  }

  /** When the last payment of the link was settled, or null if it never settled one. */
  async lastSettledPaymentAt(link: LinkWithAccount): Promise<Date | null> {
    const row = await this.settledPayments(link)
      .select('MAX(payment.createdAt)', 'last')
      .getRawOne<{ last: Date | string | null }>();
    return row?.last ? new Date(row.last) : null;
  }

  /**
   * How many payments of the link are still inside the refund period. Payments already refunded
   * are not subtracted: it is an upper bound, to show the person releasing the link what they give up.
   */
  async refundablePayments(link: LinkWithAccount, now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - this.options.releaseAfterLastPaymentDays * DAY_MS);
    return this.settledPayments(link).andWhere('payment.createdAt > :since', { since }).getCount();
  }

  /**
   * The moment both conditions hold: `releaseAfterRetiredDays` since the link was retired and
   * `releaseAfterLastPaymentDays` since its last settled payment. A link that never settled a
   * payment has nothing to refund, so only the first condition applies.
   */
  async estimatedReleaseAt(link: LinkWithAccount): Promise<Date | null> {
    if (link.status !== 'retired' || !link.retiredAt) return null;
    const afterRetired = link.retiredAt.getTime() + this.options.releaseAfterRetiredDays * DAY_MS;
    const last = await this.lastSettledPaymentAt(link);
    const afterPayment = last
      ? last.getTime() + this.options.releaseAfterLastPaymentDays * DAY_MS
      : -Infinity;
    return new Date(Math.max(afterRetired, afterPayment));
  }

  async summarize(link: LinkWithAccount): Promise<LinkSummary> {
    return {
      id: link.id,
      channelId: link.channelId,
      mpUserId: link.account.mpUserId,
      status: link.status,
      accountStatus: link.account.status,
      linkedAt: link.linkedAt,
      retiredAt: link.retiredAt,
      releasedAt: link.releasedAt,
      estimatedReleaseAt: await this.estimatedReleaseAt(link),
    };
  }

  /** Links of a store other than the one it sells with, newest first. */
  async previousLinks(channelId: ID): Promise<LinkSummary[]> {
    const links = (await this.connections.listLinks(channelId)).filter(
      (l) => l.status !== 'active',
    );
    return Promise.all(links.map((link) => this.summarize(link)));
  }

  /**
   * Daily task (PRD 9.4): releases every retired link whose refund period is over. With `dryRun`
   * it only reports which ones would be.
   */
  async releaseDueLinks(
    now = new Date(),
    options: { dryRun?: boolean } = {},
  ): Promise<{ released: number; due: { channelId: ID; mpUserId: string }[] }> {
    const retired = (await this.links.find({
      where: { status: 'retired' },
      relations: { account: true },
    })) as LinkWithAccount[];
    const due: LinkWithAccount[] = [];
    for (const link of retired) {
      const releaseAt = await this.estimatedReleaseAt(link);
      if (releaseAt && releaseAt.getTime() <= now.getTime()) due.push(link);
    }
    const summary = due.map((link) => ({
      channelId: link.channelId,
      mpUserId: link.account.mpUserId,
    }));
    if (options.dryRun) return { released: 0, due: summary };

    let released = 0;
    for (const link of due) {
      try {
        if (await this.releaseLink(link.id, now)) released++;
      } catch (error) {
        Logger.warn(
          `Could not release the link of store ${link.channelId} with account ${link.account.mpUserId}: ${error instanceof Error ? error.message : String(error)}`,
          loggerCtx,
        );
      }
    }
    return { released, due: summary };
  }

  /**
   * Releases a retired link now, whatever its refund period. Records `releasedAt`; if the account
   * has no `active` or `retired` link left, deletes its tokens and leaves it `released`; and tells
   * the store's administrators. Returns false when the link was no longer retired.
   */
  async releaseLink(linkId: ID, now = new Date()): Promise<boolean> {
    const released = await this.connection.rawConnection.transaction(async (manager) => {
      const links = manager.getRepository(MercadoPagoChannelLink);
      const link = (await links.findOne({
        where: { id: linkId },
        relations: { account: true },
      })) as LinkWithAccount | null;
      if (!link || link.status !== 'retired') return null;

      link.status = 'released';
      link.releasedAt = now;
      await links.save(link);

      // A store linking this account right now holds its row: wait for it, so the count below
      // sees its new link and the tokens are not wiped under it (PostgreSQL only; SQL.js has one
      // connection and nothing to wait for).
      let account = link.account;
      if (manager.connection.options.type === 'postgres') {
        // The row as it is once the lock is ours, not as it was read before waiting for it.
        account =
          (await manager
            .getRepository(MercadoPagoAccount)
            .createQueryBuilder('account')
            .setLock('pessimistic_write')
            .where('account.id = :id', { id: link.accountId })
            .getOne()) ?? account;
      }
      const stillUsed = await links.count({
        where: { accountId: link.accountId, status: In(['active', 'retired']) },
      });
      if (stillUsed === 0) {
        const accounts = manager.getRepository(MercadoPagoAccount);
        account.accessToken = '';
        account.refreshToken = '';
        account.status = 'released';
        await accounts.save(account);
      }
      return { channelId: link.channelId, mpUserId: link.account.mpUserId };
    });
    if (!released) return false;
    this.eventBus.publish(
      new MercadoPagoAttentionEvent('link_released', released.channelId, {
        mpUserId: released.mpUserId,
        message: `Mercado Pago account ${released.mpUserId} was released from this store.`,
      }),
    );
    return true;
  }

  /** The superadmin's version of `releaseLink`: only a retired link can be released, and it must exist. */
  async releaseLinkNow(linkId: ID): Promise<LinkSummary> {
    const link = (await this.links.findOne({
      where: { id: linkId },
      relations: { account: true },
    })) as LinkWithAccount | null;
    if (!link) throw new UserInputError('No such link.');
    if (link.status !== 'retired') {
      throw new UserInputError(
        link.status === 'active'
          ? 'The store still sells with this account: retire it first.'
          : 'This link was already released.',
      );
    }
    await this.releaseLink(linkId);
    return this.summarize(
      (await this.links.findOneOrFail({
        where: { id: linkId },
        relations: { account: true },
      })) as LinkWithAccount,
    );
  }

  async findLink(linkId: ID): Promise<LinkWithAccount | null> {
    return (await this.links.findOne({
      where: { id: linkId },
      relations: { account: true },
    })) as LinkWithAccount | null;
  }
}
