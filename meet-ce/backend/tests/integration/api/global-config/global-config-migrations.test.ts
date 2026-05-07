import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { globalConfigMigrations } from '../../../../src/migrations/global-config-migrations.js';
import { generateSchemaMigrationName } from '../../../../src/models/migration.model.js';
import {
	meetGlobalConfigCollectionName,
	MeetGlobalConfigDocument,
	MeetGlobalConfigModel
} from '../../../../src/models/mongoose-schemas/global-config.schema.js';
import { MigrationService } from '../../../../src/services/migration.service.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

// Legacy document builders used by integration tests.
// When GLOBAL_CONFIG_SCHEMA_VERSION increases, add one builder per legacy version that
// must still be migrated to the current one.

const buildLegacyGlobalConfigV1 = (projectId: string) => ({
	schemaVersion: 1,
	projectId,
	securityConfig: {
		authentication: {
			authMethod: {
				type: 'single_user'
			},
			authModeToAccessRoom: 'none'
		}
	},
	webhooksConfig: {
		enabled: true,
		url: 'https://example.com/webhook'
	},
	roomsConfig: {
		appearance: {
			themes: []
		}
	}
});

/**
 * Single assertion function for migrated global config documents in integration tests.
 * This ensures all fields are validated consistently across test cases, and serves
 * as a single source of truth for the expected final state of any migrated global
 * config document (regardless of the original version).
 * Keep this aligned with the CURRENT global config schema (not intermediate versions).
 */
const expectMigratedGlobalConfigToCurrentVersion = (migratedConfig: Record<string, unknown>, projectId: string) => {
	expect(migratedConfig).toMatchObject({
		schemaVersion: INTERNAL_CONFIG.GLOBAL_CONFIG_SCHEMA_VERSION,
		projectId,
		securityConfig: {
			authentication: {
				oauthProviders: []
			}
		},
		webhooksConfig: {
			enabled: true,
			url: 'https://example.com/webhook'
		},
		roomsConfig: {
			appearance: {
				themes: []
			}
		}
	});

	expect(migratedConfig).not.toHaveProperty('securityConfig.authentication.authMethod');
	expect(migratedConfig).not.toHaveProperty('securityConfig.authentication.authModeToAccessRoom');
};

describe('GlobalConfig Schema Migrations', () => {
	/**
	 * Unit tests validate each transform independently.
	 * Add one test per global config transform function.
	 */
	describe('GlobalConfig Migration Transforms', () => {
		it('should transform global config schema from v1 to v2', () => {
			const migrationName = generateSchemaMigrationName(meetGlobalConfigCollectionName, 1, 2);
			const transform = globalConfigMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const configV1 = {
				schemaVersion: 1,
				projectId: 'project_v1',
				securityConfig: {
					authentication: {
						authMethod: { type: 'single_user' },
						authModeToAccessRoom: 'none'
					}
				},
				webhooksConfig: {
					enabled: true,
					url: 'https://example.com/webhook'
				},
				roomsConfig: {
					appearance: {
						themes: []
					}
				}
			} as unknown as MeetGlobalConfigDocument;

			const migratedConfig = transform!(configV1);
			expect(migratedConfig).toMatchObject({
				projectId: 'project_v1',
				securityConfig: {
					authentication: {
						oauthProviders: []
					}
				},
				webhooksConfig: {
					enabled: true,
					url: 'https://example.com/webhook'
				},
				roomsConfig: {
					appearance: {
						themes: []
					}
				}
			});
			expect(migratedConfig).not.toHaveProperty('securityConfig.authentication.authMethod');
			expect(migratedConfig).not.toHaveProperty('securityConfig.authentication.authModeToAccessRoom');
		});
	});

	describe('GlobalConfig Migration Integration', () => {
		let migrationService: MigrationService;
		const testProjectIds: string[] = [];

		beforeAll(async () => {
			await startTestServer();
			migrationService = container.get(MigrationService);
		});

		afterAll(async () => {
			await MeetGlobalConfigModel.collection.deleteMany({ projectId: { $in: testProjectIds } });
		});

		/**
		 * Integration tests validate that any legacy version reaches the CURRENT version.
		 * Keep one case per supported legacy version in this matrix.
		 */
		it.each([{ fromVersion: 1, buildDocument: buildLegacyGlobalConfigV1 }])(
			'should migrate a legacy global config document from v$fromVersion to current version',
			async ({ buildDocument }) => {
				const legacyProjectId = `legacy_project_${Date.now()}`;
				testProjectIds.push(legacyProjectId);

				await MeetGlobalConfigModel.collection.insertOne(buildDocument(legacyProjectId));
				await migrationService.runMigrations();

				const migratedConfig = await MeetGlobalConfigModel.collection.findOne({ projectId: legacyProjectId });
				expect(migratedConfig).toBeTruthy();
				expectMigratedGlobalConfigToCurrentVersion(migratedConfig as Record<string, unknown>, legacyProjectId);
			}
		);
	});
});
