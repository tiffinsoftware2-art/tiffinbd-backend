import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Website CMS: hero slider images and YouTube videos, managed from the
 * dashboard (Super Admin). Two new tables; nothing existing changes.
 * The four videos the website shows today are added so it looks the same
 * after this goes live. The hero starts empty, and the website keeps its
 * built-in banner until an image is uploaded.
 */
export class AddWebsiteCms1787000000011 implements MigrationInterface {
  name = 'AddWebsiteCms1787000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`site_hero_slides\` (
        \`id\` varchar(36) NOT NULL,
        \`data\` mediumblob NOT NULL,
        \`mime_type\` varchar(50) NOT NULL,
        \`alt\` varchar(255) NOT NULL DEFAULT '',
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE \`site_videos\` (
        \`id\` varchar(36) NOT NULL,
        \`youtube_id\` varchar(20) NOT NULL,
        \`title\` varchar(255) NOT NULL DEFAULT '',
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    const current = [
      'NULExgnBsSs',
      'vC3TfSfq7mk',
      'Ks5yNalIE1s',
      'UznBBXsQ4Ek',
    ];
    for (const [i, id] of current.entries()) {
      await queryRunner.query(
        'INSERT INTO `site_videos` (`id`, `youtube_id`, `title`, `sort_order`) VALUES (UUID(), ?, ?, ?)',
        [id, `Tiffin Video ${i + 1}`, i],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `site_videos`');
    await queryRunner.query('DROP TABLE `site_hero_slides`');
  }
}
