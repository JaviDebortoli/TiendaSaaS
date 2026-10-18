import { MigrationInterface, QueryRunner } from 'typeorm';

export class Platform1792354900631 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "seller" ADD "customFieldsCuit" character varying(255)`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "seller" ADD "customFieldsContactemail" character varying(255)`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "seller" ADD "customFieldsLogourl" character varying(255)`,
      undefined,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "seller" DROP COLUMN "customFieldsLogourl"`, undefined);
    await queryRunner.query(
      `ALTER TABLE "seller" DROP COLUMN "customFieldsContactemail"`,
      undefined,
    );
    await queryRunner.query(`ALTER TABLE "seller" DROP COLUMN "customFieldsCuit"`, undefined);
  }
}
