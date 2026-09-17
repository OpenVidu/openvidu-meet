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

type InsertedId = Awaited<ReturnType<typeof MeetGlobalConfigModel.collection.insertOne>>['insertedId'];

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

const buildLegacyGlobalConfigV2 = (projectId: string) => ({
	schemaVersion: 2,
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

const buildLegacyGlobalConfigV3 = (projectId: string) => ({
	schemaVersion: 3,
	projectId,
	securityConfig: {
		authentication: {
			oauthProviders: []
		}
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
const expectMigratedGlobalConfigToCurrentVersion = (migratedConfig: Record<string, unknown>) => {
	expect(migratedConfig).toMatchObject({
		schemaVersion: INTERNAL_CONFIG.GLOBAL_CONFIG_SCHEMA_VERSION,
		securityConfig: {
			authentication: {
				oauthProviders: []
			}
		},
		roomsConfig: {
			appearance: {
				themes: []
			}
		}
	});

	expect(migratedConfig).not.toHaveProperty('securityConfig.authentication.authMethod');
	expect(migratedConfig).not.toHaveProperty('securityConfig.authentication.authModeToAccessRoom');
	// Webhooks became a resource of their own; the startup step migrates the URL before the schema
	// migration drops the field (see WebhookMigration in migrations/webhooks-migration.ts)
	expect(migratedConfig).not.toHaveProperty('webhooksConfig');
	expect(migratedConfig).not.toHaveProperty('projectId');
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
				// v1→v2 predates the webhook resource: the field survives until v2→v3 drops it
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

		it('should transform global config schema from v2 to v3 dropping the legacy webhook config', () => {
			const migrationName = generateSchemaMigrationName(meetGlobalConfigCollectionName, 2, 3);
			const transform = globalConfigMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const configV2 = buildLegacyGlobalConfigV2('project_v2') as unknown as MeetGlobalConfigDocument;

			const migratedConfig = transform!(configV2);
			expect(migratedConfig).toMatchObject({
				projectId: 'project_v2',
				securityConfig: {
					authentication: {
						oauthProviders: []
					}
				},
				roomsConfig: {
					appearance: {
						themes: []
					}
				}
			});
			expect(migratedConfig).not.toHaveProperty('webhooksConfig');
		});

		it('should transform global config schema from v3 to v4 dropping the project id', () => {
			const migrationName = generateSchemaMigrationName(meetGlobalConfigCollectionName, 3, 4);
			const transform = globalConfigMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const configV3 = buildLegacyGlobalConfigV3('project_v3') as unknown as MeetGlobalConfigDocument;

			const migratedConfig = transform!(configV3);
			expect(migratedConfig).toMatchObject({
				securityConfig: {
					authentication: {
						oauthProviders: []
					}
				},
				roomsConfig: {
					appearance: {
						themes: []
					}
				}
			});
			expect(migratedConfig).not.toHaveProperty('projectId');
		});
	});

	describe('GlobalConfig Migration Integration', () => {
		let migrationService: MigrationService;
		const testDocumentIds: InsertedId[] = [];

		beforeAll(async () => {
			await startTestServer();
			migrationService = container.get(MigrationService);
		});

		afterAll(async () => {
			await MeetGlobalConfigModel.collection.deleteMany({ _id: { $in: testDocumentIds } });
		});

		/**
		 * Integration tests validate that any legacy version reaches the CURRENT version.
		 * Keep one case per supported legacy version in this matrix.
		 */
		it.each([
			{ fromVersion: 1, buildDocument: buildLegacyGlobalConfigV1 },
			{ fromVersion: 2, buildDocument: buildLegacyGlobalConfigV2 },
			{ fromVersion: 3, buildDocument: buildLegacyGlobalConfigV3 }
		])(
			'should migrate a legacy global config document from v$fromVersion to current version',
			async ({ buildDocument }) => {
				const { insertedId } = await MeetGlobalConfigModel.collection.insertOne(
					buildDocument(`legacy_project_${Date.now()}`)
				);
				testDocumentIds.push(insertedId);

				await migrationService.runMigrations();

				const migratedConfig = await MeetGlobalConfigModel.collection.findOne({ _id: insertedId });
				expect(migratedConfig).toBeTruthy();
				expectMigratedGlobalConfigToCurrentVersion(migratedConfig as Record<string, unknown>);
			}
		);
	});
});
