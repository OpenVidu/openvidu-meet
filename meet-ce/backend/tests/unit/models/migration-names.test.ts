import { describe, expect, it } from '@jest/globals';
import {
	generateSchemaMigrationName,
	isDataMigrationName,
	isSchemaMigrationName,
	isValidMigrationNameFormat,
	LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME
} from '../../../src/models/migration.model.js';

/**
 * The `MeetMigration` collection is the audit trail of every migration a deployment has run, and its
 * Mongoose schema validates the name against `isValidMigrationNameFormat`. A name that fails that
 * validator cannot be recorded at all, so the two categories — the per-document schema migrations and
 * the one-shot data migrations invoked at startup — must both be accepted, and must stay distinct.
 */

describe('Migration names', () => {
	describe('isSchemaMigrationName', () => {
		it('should accept generated schema migration names', () => {
			expect(isSchemaMigrationName(generateSchemaMigrationName('MeetRoom', 3, 4))).toBe(true);
			expect(isSchemaMigrationName(generateSchemaMigrationName('MeetGlobalConfig', 2, 3))).toBe(true);
		});

		it('should reject data migration names', () => {
			expect(isSchemaMigrationName(LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME)).toBe(false);
		});
	});

	describe('isDataMigrationName', () => {
		it('should accept the legacy webhook config migration name', () => {
			expect(isDataMigrationName(LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME)).toBe(true);
		});

		it('should reject schema migration names', () => {
			expect(isDataMigrationName(generateSchemaMigrationName('MeetRoom', 3, 4))).toBe(false);
		});

		it('should reject malformed names', () => {
			expect(isDataMigrationName('data_')).toBe(false);
			expect(isDataMigrationName('data')).toBe(false);
			expect(isDataMigrationName('Data_Legacy_Webhook')).toBe(false);
			expect(isDataMigrationName('legacy_webhook_config')).toBe(false);
		});
	});

	describe('isValidMigrationNameFormat', () => {
		it('should accept both categories', () => {
			expect(isValidMigrationNameFormat(generateSchemaMigrationName('MeetRoom', 3, 4))).toBe(true);
			expect(isValidMigrationNameFormat(LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME)).toBe(true);
		});

		it('should reject a name belonging to neither category', () => {
			expect(isValidMigrationNameFormat('legacy_storage_to_mongodb')).toBe(false);
			expect(isValidMigrationNameFormat('schema_room_v1')).toBe(false);
			expect(isValidMigrationNameFormat('')).toBe(false);
		});
	});
});
