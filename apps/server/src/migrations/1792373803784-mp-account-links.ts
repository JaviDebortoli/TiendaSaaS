import { MigrationInterface, QueryRunner } from 'typeorm';
import { TokenCipher } from 'vendure-plugin-mercadopago';

interface LegacyConnection {
  id: string;
  channelId: string;
  mpUserId: string;
  accessToken: string;
  refreshToken: string;
}

// How the tokens are bound to their ciphertext. Frozen here on purpose: a migration describes the
// data as it was when it ran, so renaming the plugin's contexts later must not change it.
const accountAccessContext = (mpUserId: string) => `mp-account:${mpUserId}:access`;
const accountRefreshContext = (mpUserId: string) => `mp-account:${mpUserId}:refresh`;
// ...and in the one-connection-per-store design.
const legacyAccessContext = (channelId: string) => `mp-connection:${channelId}:access`;
const legacyRefreshContext = (channelId: string) => `mp-connection:${channelId}:refresh`;

/**
 * Splits `mercado_pago_connection` into an account (tokens, one per Mercado Pago user) and a
 * channel link (which store uses it). Every existing connection becomes one account and one
 * `active` link, and its tokens are re-encrypted for the account. The payments already taken are
 * stamped with the account that charged them (their store's account, the only one that existed).
 */
export class MpAccountLinks1792373803784 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "mercado_pago_account" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "mpUserId" character varying NOT NULL, "accessToken" text NOT NULL, "refreshToken" text NOT NULL, "publicKey" character varying, "expiresAt" TIMESTAMP NOT NULL, "scope" character varying, "status" character varying NOT NULL, "lastError" character varying, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), CONSTRAINT "PK_0964348436ff5f3e378ea1c5198" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3c26ff62d1801ac97b7a48a4c3" ON "mercado_pago_account" ("mpUserId") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE TABLE "mercado_pago_channel_link" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" character varying NOT NULL, "linkedAt" TIMESTAMP NOT NULL, "retiredAt" TIMESTAMP, "releasedAt" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channelId" character varying NOT NULL, "accountId" uuid NOT NULL, CONSTRAINT "PK_b84f627df252b7a7e7fd5dfcac2" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aa63ccb7339668f638d61d0807" ON "mercado_pago_channel_link" ("channelId") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mp_link_one_active_per_account" ON "mercado_pago_channel_link" ("accountId") WHERE "status" = 'active'`,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mp_link_one_active_per_channel" ON "mercado_pago_channel_link" ("channelId") WHERE "status" = 'active'`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "mercado_pago_channel_link" ADD CONSTRAINT "FK_d3fd23e56687ee135feda0d7d90" FOREIGN KEY ("accountId") REFERENCES "mercado_pago_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
      undefined,
    );

    await this.copyConnections(queryRunner);
    await this.stampPayments(queryRunner);

    await queryRunner.query(`DROP INDEX "public"."IDX_45c89938e2bbc70a0c66c09dd4"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_a00e980e64583ba91468c71a81"`, undefined);
    await queryRunner.query(`DROP TABLE "mercado_pago_connection"`, undefined);
  }

  /**
   * Brings back the one-connection-per-store table from the `active` links. Accounts that only
   * have `retired` or `released` links, and those links, cannot be represented and are dropped.
   * The tokens are encrypted for the store again.
   */
  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "mercado_pago_connection" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "mpUserId" character varying NOT NULL, "accessToken" text NOT NULL, "refreshToken" text NOT NULL, "publicKey" character varying, "expiresAt" TIMESTAMP NOT NULL, "scope" character varying, "status" character varying NOT NULL, "lastError" character varying, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channelId" character varying NOT NULL, CONSTRAINT "PK_3ccd831ff69267b60cde59b1902" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a00e980e64583ba91468c71a81" ON "mercado_pago_connection" ("channelId") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_45c89938e2bbc70a0c66c09dd4" ON "mercado_pago_connection" ("mpUserId") `,
      undefined,
    );

    const rows: {
      linkId: string;
      channelId: string;
      mpUserId: string;
      accessToken: string;
      refreshToken: string;
    }[] = await queryRunner.query(
      `SELECT l."id" AS "linkId", l."channelId", a."mpUserId", a."accessToken", a."refreshToken"
       FROM "mercado_pago_channel_link" l JOIN "mercado_pago_account" a ON a."id" = l."accountId"
       WHERE l."status" = 'active'`,
    );
    const cipher = rows.some((r) => r.accessToken || r.refreshToken) ? requireCipher() : undefined;
    for (const row of rows) {
      const accessToken = row.accessToken
        ? cipher!.encrypt(
            cipher!.decrypt(row.accessToken, accountAccessContext(row.mpUserId)),
            legacyAccessContext(row.channelId),
          )
        : '';
      const refreshToken = row.refreshToken
        ? cipher!.encrypt(
            cipher!.decrypt(row.refreshToken, accountRefreshContext(row.mpUserId)),
            legacyRefreshContext(row.channelId),
          )
        : '';
      await queryRunner.query(
        `INSERT INTO "mercado_pago_connection" ("createdAt", "channelId", "mpUserId", "accessToken", "refreshToken", "publicKey", "expiresAt", "scope", "status", "lastError")
         SELECT l."linkedAt", l."channelId", a."mpUserId", $1, $2, a."publicKey", a."expiresAt", a."scope",
                CASE WHEN a."status" = 'released' THEN 'disconnected' ELSE a."status" END, a."lastError"
         FROM "mercado_pago_channel_link" l JOIN "mercado_pago_account" a ON a."id" = l."accountId"
         WHERE l."id" = $3`,
        [accessToken, refreshToken, row.linkId],
      );
    }

    await queryRunner.query(
      `ALTER TABLE "mercado_pago_channel_link" DROP CONSTRAINT "FK_d3fd23e56687ee135feda0d7d90"`,
      undefined,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_mp_link_one_active_per_channel"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_mp_link_one_active_per_account"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_aa63ccb7339668f638d61d0807"`, undefined);
    await queryRunner.query(`DROP TABLE "mercado_pago_channel_link"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_3c26ff62d1801ac97b7a48a4c3"`, undefined);
    await queryRunner.query(`DROP TABLE "mercado_pago_account"`, undefined);
  }

  private async copyConnections(queryRunner: QueryRunner): Promise<void> {
    const connections: LegacyConnection[] = await queryRunner.query(
      `SELECT "id", "channelId", "mpUserId", "accessToken", "refreshToken" FROM "mercado_pago_connection" ORDER BY "createdAt"`,
    );
    if (connections.length === 0) return;
    const cipher = connections.some((c) => c.accessToken || c.refreshToken)
      ? requireCipher()
      : undefined;

    for (const connection of connections) {
      // A revoked connection has no tokens (they were wiped), so there is nothing to re-encrypt.
      const accessToken = connection.accessToken
        ? cipher!.encrypt(
            cipher!.decrypt(connection.accessToken, legacyAccessContext(connection.channelId)),
            accountAccessContext(connection.mpUserId),
          )
        : '';
      const refreshToken = connection.refreshToken
        ? cipher!.encrypt(
            cipher!.decrypt(connection.refreshToken, legacyRefreshContext(connection.channelId)),
            accountRefreshContext(connection.mpUserId),
          )
        : '';
      // Dates are copied by the database, never through a JavaScript Date: these columns have no
      // time zone, and a round trip through the process time zone could shift them.
      const [account]: { id: string }[] = await queryRunner.query(
        `INSERT INTO "mercado_pago_account" ("createdAt", "mpUserId", "accessToken", "refreshToken", "publicKey", "expiresAt", "scope", "status", "lastError")
         SELECT "createdAt", "mpUserId", $1, $2, "publicKey", "expiresAt", "scope", "status", "lastError"
         FROM "mercado_pago_connection" WHERE "id" = $3 RETURNING "id"`,
        [accessToken, refreshToken, connection.id],
      );
      await queryRunner.query(
        `INSERT INTO "mercado_pago_channel_link" ("channelId", "accountId", "status", "linkedAt")
         SELECT "channelId", $1, 'active', "createdAt" FROM "mercado_pago_connection" WHERE "id" = $2`,
        [account!.id, connection.id],
      );
    }
  }

  /** Adds `mpAccountUserId` to the metadata of every Mercado Pago payment taken so far. */
  private async stampPayments(queryRunner: QueryRunner): Promise<void> {
    const payments: { id: string; metadata: string; mpUserId: string }[] = await queryRunner.query(
      `SELECT DISTINCT p."id", p."metadata", a."mpUserId"
       FROM "payment" p
       JOIN "order_channels_channel" oc ON oc."orderId" = p."orderId"
       JOIN "mercado_pago_channel_link" l ON l."channelId" = oc."channelId"::text AND l."status" = 'active'
       JOIN "mercado_pago_account" a ON a."id" = l."accountId"
       WHERE p."metadata" LIKE '%"mpPaymentId"%'`,
    );
    for (const payment of payments) {
      let metadata: Record<string, unknown>;
      try {
        metadata = JSON.parse(payment.metadata) as Record<string, unknown>;
      } catch {
        continue; // not ours to rewrite
      }
      if (metadata.mpAccountUserId !== undefined) continue;
      await queryRunner.query(`UPDATE "payment" SET "metadata" = $1 WHERE "id" = $2`, [
        JSON.stringify({ ...metadata, mpAccountUserId: payment.mpUserId }),
        payment.id,
      ]);
    }
  }
}

function requireCipher(): TokenCipher {
  const key = process.env.MP_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error(
      'MP_TOKEN_ENCRYPTION_KEY is required to migrate the stored Mercado Pago tokens (they are re-encrypted for the account).',
    );
  }
  return new TokenCipher(key);
}
