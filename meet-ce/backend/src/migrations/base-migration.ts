import { Model } from 'mongoose';
import { ISchemaMigration, MigrationContext, MigrationResult, SchemaVersion } from '../models/migration.model.js';

/**
 * Base class for schema migrations providing common functionality.
 * Extend this class to implement specific migrations for collections.
 */
export abstract class BaseSchemaMigration<TDocument> implements ISchemaMigration<TDocument> {
	abstract fromVersion: SchemaVersion;
	abstract toVersion: SchemaVersion;
	abstract description: string;

	/**
	 * Default batch size for processing documents.
	 * Can be overridden in subclasses for collections with large documents.
	 */
	protected readonly defaultBatchSize = 50;

	/**
	 * Executes the migration in batches.
	 * Processes all documents at fromVersion and upgrades them to toVersion.
	 */
	async execute(model: Model<TDocument>, context: MigrationContext): Promise<MigrationResult> {
		const startTime = Date.now();
		const batchSize = context.batchSize || this.defaultBatchSize;
		let migratedCount = 0;
		const skippedCount = 0;
		let failedCount = 0;

		context.logger.info(
			`Starting schema migration: ${this.description} (v${this.fromVersion} -> v${this.toVersion})`
		);

		try {
			// Find all documents at the source version
			const totalDocs = await model.countDocuments({ schemaVersion: this.fromVersion }).exec();

			if (totalDocs === 0) {
				context.logger.info('No documents to migrate');
				return {
					migratedCount: 0,
					skippedCount: 0,
					failedCount: 0,
					durationMs: Date.now() - startTime
				};
			}

			context.logger.info(`Found ${totalDocs} documents to migrate`);

			// Process documents in batches
			let processedCount = 0;

			while (processedCount < totalDocs) {
				const documents = await model.find({ schemaVersion: this.fromVersion }).limit(batchSize).exec();

				if (documents.length === 0) {
					break;
				}

				// Transform and update each document
				for (const doc of documents) {
					try {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const updates = await this.transform(doc as any);

						// Update the document with new fields and version
						await model
							.updateOne(
								{ _id: doc._id },
								{
									$set: {
										...updates,
										schemaVersion: this.toVersion
									}
								}
							)
							.exec();

						migratedCount++;
					} catch (error) {
						failedCount++;
						context.logger.warn(`Failed to migrate document ${doc._id}:`, error);
					}
				}

				processedCount += documents.length;
				context.logger.debug(`Processed ${processedCount}/${totalDocs} documents`);
			}

			const durationMs = Date.now() - startTime;
			context.logger.info(
				`Migration completed: ${migratedCount} migrated, ${failedCount} failed (${durationMs}ms)`
			);

			return {
				migratedCount,
				skippedCount,
				failedCount,
				durationMs
			};
		} catch (error) {
			context.logger.error('Migration failed:', error);
			throw error;
		}
	}

	/**
	 * Transform a single document from source version to target version.
	 * Override this method to implement the specific transformation logic.
	 *
	 * @param document - The document to transform
	 * @returns Object with fields to update (excluding schemaVersion which is handled automatically)
	 */
	protected abstract transform(document: TDocument): Promise<Partial<TDocument>>;

	/**
	 * Optional validation before running migration.
	 * Default implementation always returns true.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async validate(_model: Model<TDocument>, _context: MigrationContext): Promise<boolean> {
		return true;
	}
}
