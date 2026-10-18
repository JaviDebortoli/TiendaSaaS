import { MigrationInterface, QueryRunner } from 'typeorm';

export class Mercadopago1792354373861 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
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
    await queryRunner.query(
      `CREATE TABLE "mercado_pago_o_auth_state" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "state" character varying NOT NULL, "codeVerifier" text NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "consumedAt" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channelId" character varying NOT NULL, CONSTRAINT "PK_137d8f9eaf323e78804106bfb46" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6290b3ba0c337737e1b4c140af" ON "mercado_pago_o_auth_state" ("state") `,
      undefined,
    );
    await queryRunner.query(
      `CREATE TABLE "mercado_pago_payment_claim" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "mpPaymentId" character varying NOT NULL, "orderCode" character varying NOT NULL, "status" character varying NOT NULL, "lastStatus" character varying, "claimedAt" TIMESTAMP NOT NULL, "note" character varying, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channelId" character varying NOT NULL, CONSTRAINT "PK_052a28175bdad8ae3da80251265" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_00ea547af6d231fa7f7962c7ab" ON "mercado_pago_payment_claim" ("mpPaymentId") `,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "channel" ADD "customFieldsMpstorefronturl" character varying(255)`,
      undefined,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channel" DROP COLUMN "customFieldsMpstorefronturl"`,
      undefined,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_00ea547af6d231fa7f7962c7ab"`, undefined);
    await queryRunner.query(`DROP TABLE "mercado_pago_payment_claim"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_6290b3ba0c337737e1b4c140af"`, undefined);
    await queryRunner.query(`DROP TABLE "mercado_pago_o_auth_state"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_45c89938e2bbc70a0c66c09dd4"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_a00e980e64583ba91468c71a81"`, undefined);
    await queryRunner.query(`DROP TABLE "mercado_pago_connection"`, undefined);
  }
}
