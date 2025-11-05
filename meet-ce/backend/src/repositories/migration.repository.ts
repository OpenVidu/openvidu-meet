import { inject, injectable } from 'inversify';
import { MeetMigration, MigrationName, MigrationStatus } from '../models/index.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';
import { MeetMigrationDocument, MeetMigrationModel } from './schemas/migration.schema.js';

@injectable()
export class MigrationRepository extends BaseRepository<MeetMigration, MeetMigrationDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetMigrationModel);
	}

	/**
	 * Transforms a MongoDB document into a domain MeetMigration object.
	 *
	 * @param document - The MongoDB document
	 * @returns MeetMigration domain object
	 */
	protected toDomain(document: MeetMigrationDocument): MeetMigration {
		return document.toObject() as MeetMigration;
	}

	/**
	 * Mark a migration as started.
	 * Creates a new migration record with RUNNING status.
	 *
	 * @param name - The name of the migration
	 * @returns The created migration document
	 */
	async markAsStarted(name: MigrationName): Promise<MeetMigration> {
		const document = await this.createDocument({
			name,
			status: MigrationStatus.RUNNING,
			startedAt: new Date()
		});
		return this.toDomain(document);
	}

	/**
	 * Mark a migration as completed successfully.
	 * Updates the migration record with COMPLETED status and completion timestamp.
	 *
	 * @param name - The name of the migration
	 * @param metadata - Optional metadata about the migration execution
	 * @returns The updated migration document
	 */
	async markAsCompleted(name: MigrationName, metadata?: Record<string, unknown>): Promise<MeetMigration> {
		const document = await this.updateOne(
			{ name },
			{
				$set: {
					status: MigrationStatus.COMPLETED,
					completedAt: new Date(),
					...(metadata && { metadata })
				}
			}
		);
		return this.toDomain(document);
	}

	/**
	 * Mark a migration as failed.
	 * Updates the migration record with FAILED status, completion timestamp, and error message.
	 *
	 * @param name - The name of the migration
	 * @param error - Error message describing the failure
	 * @returns The updated migration document
	 */
	async markAsFailed(name: MigrationName, error: string): Promise<MeetMigration> {
		const document = await this.updateOne(
			{ name },
			{
				$set: {
					status: MigrationStatus.FAILED,
					completedAt: new Date(),
					error
				}
			}
		);
		return this.toDomain(document);
	}

	/**
	 * Get all migrations with their current status.
	 *
	 * @returns Array of all migration documents
	 */
	async getAllMigrations(): Promise<MeetMigration[]> {
		const documents = await this.findAll();
		return documents;
	}

	/**
	 * Get a specific migration by name.
	 *
	 * @param name - The name of the migration
	 * @returns The migration document or null if not found
	 */
	async getMigration(name: MigrationName): Promise<MeetMigration | null> {
		const document = await this.findOne({ name });
		return document ? this.toDomain(document) : null;
	}

	/**
	 * Check if a migration has been completed successfully.
	 *
	 * @param name - The name of the migration to check
	 * @returns true if the migration was completed successfully, false otherwise
	 */
	async isCompleted(name: MigrationName): Promise<boolean> {
		const migration = await this.findOne({ name, status: MigrationStatus.COMPLETED });
		return migration !== null;
	}
}
