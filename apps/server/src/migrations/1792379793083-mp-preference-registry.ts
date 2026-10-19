import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The registry of Mercado Pago preferences the platform issued (PRD 9.6, 9.7). There is nothing to
 * migrate: payments are matched only against preferences issued from now on.
 */
export class MpPreferenceRegistry1792379793083 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "mercado_pago_preference" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "token" character varying NOT NULL, "externalReference" character varying NOT NULL, "idempotencyKey" character varying NOT NULL, "orderCode" character varying NOT NULL, "totalWithTax" integer NOT NULL, "preferenceId" character varying, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" character varying NOT NULL, "channelId" character varying NOT NULL, "accountId" uuid NOT NULL, "linkId" uuid NOT NULL, CONSTRAINT "PK_7a64d280fe50f89643083c8b4cc" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1de14b1aa6d084981ea6c0582b" ON "mercado_pago_preference" ("token") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9f5c3dbecfdb09100b529afcd7" ON "mercado_pago_preference" ("externalReference") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e1e97f09a85420a3f5e51ab24e" ON "mercado_pago_preference" ("idempotencyKey") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c26f1cbc2bcf310f9d14887b22" ON "mercado_pago_preference" ("orderId") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9d39f1a686a136ea1a05725698" ON "mercado_pago_preference" ("channelId") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8d4fc6922328bea0688b7af271" ON "mercado_pago_preference" ("preferenceId") `,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "mercado_pago_preference" ADD CONSTRAINT "FK_8798d5967f5b1a0a013d34e0378" FOREIGN KEY ("accountId") REFERENCES "mercado_pago_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "mercado_pago_preference" ADD CONSTRAINT "FK_6569adf8190ef7e56ac3eb677f3" FOREIGN KEY ("linkId") REFERENCES "mercado_pago_channel_link"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
      undefined,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "mercado_pago_preference" DROP CONSTRAINT "FK_6569adf8190ef7e56ac3eb677f3"`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "mercado_pago_preference" DROP CONSTRAINT "FK_8798d5967f5b1a0a013d34e0378"`,
      undefined,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_8d4fc6922328bea0688b7af271"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_9d39f1a686a136ea1a05725698"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_c26f1cbc2bcf310f9d14887b22"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_e1e97f09a85420a3f5e51ab24e"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_9f5c3dbecfdb09100b529afcd7"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_1de14b1aa6d084981ea6c0582b"`, undefined);
    await queryRunner.query(`DROP TABLE "mercado_pago_preference"`, undefined);
  }
}
