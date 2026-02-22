import { SortAndPagination, SortOrder } from '@openvidu-meet/typings';
import { inject, injectable, unmanaged } from 'inversify';
import { FilterQuery, Model, Require_id, UpdateQuery } from 'mongoose';
import { PaginatedResult, PaginationCursor } from '../models/db-pagination.model.js';
import { LoggerService } from '../services/logger.service.js';

/**
 * Base repository providing common CRUD operations for MongoDB entities.
 * This class is meant to be extended by specific entity repositories.
 *
 * @template TDomain - The domain interface type
 * @template TDocument - The persisted model shape used in MongoDB (extends TDomain)
 */
@injectable()
export abstract class BaseRepository<TDomain, TDocument extends TDomain = TDomain> {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@unmanaged() protected model: Model<TDocument>
	) {}

	/**
	 * Transforms a persisted object into a domain object.
	 * Must be implemented by each concrete repository to apply entity-specific transformations.
	 *
	 * @param dbObject - The persisted object to transform
	 * @returns The domain object
	 */
	protected abstract toDomain(dbObject: Require_id<TDocument> & { __v: number }): TDomain;

	/**
	 * Creates a new document.
	 *
	 * @param data - The data to create
	 * @returns The created domain object
	 */
	protected async createDocument(data: TDomain): Promise<TDomain> {
		try {
			const document = await this.model.create(data);
			this.logger.debug(`Document created with ID: ${document._id}`);
			return this.toDomain(document.toObject());
		} catch (error) {
			this.logger.error('Error creating document:', error);
			throw error;
		}
	}

	/**
	 * Finds a single document matching the given filter.
	 *
	 * @param filter - MongoDB query filter
	 * @param fields - Optional array of field names to select from database
	 * @returns The domain object or null if not found
	 */
	protected async findOne(filter: FilterQuery<TDocument>, fields?: string[]): Promise<TDomain | null> {
		try {
			const projection = fields && fields.length > 0 ? fields.join(' ') : undefined;
			const document = (await this.model.findOne(filter, projection).lean().exec()) as
				| (Require_id<TDocument> & { __v: number })
				| null;
			return document ? this.toDomain(document) : null;
		} catch (error) {
			this.logger.error('Error finding document with filter:', filter, error);
			throw error;
		}
	}

	/**
	 * Finds all documents matching the given filter without pagination.
	 * WARNING: Use with caution on large collections. Consider using findMany() with pagination instead.
	 *
	 * @param filter - Base MongoDB query filter
	 * @param fields - Optional array of field names to select from database
	 * @returns Array of domain objects matching the filter
	 */
	protected async findAll(filter: FilterQuery<TDocument> = {}, fields?: string[]): Promise<TDomain[]> {
		try {
			const projection = fields && fields.length > 0 ? fields.join(' ') : undefined;
			const documents = (await this.model.find(filter, projection).lean().exec()) as Array<
				Require_id<TDocument> & { __v: number }
			>;
			return documents.map((doc) => this.toDomain(doc));
		} catch (error) {
			this.logger.error('Error finding all documents with filter:', filter, error);
			throw error;
		}
	}

	/**
	 * Finds all documents matching the given filter with optional pagination and sorting.
	 *
	 * @param filter - Base MongoDB query filter
	 * @param options - Pagination options
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination (encoded cursor)
	 * @param options.sortField - Field to sort by (default: '_id')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @param fields - Optional array of field names to select from database
	 * @returns Paginated result with items, truncation flag, and optional next token
	 */
	protected async findMany(
		filter: FilterQuery<TDocument> = {},
		options: SortAndPagination = {},
		fields?: string[]
	): Promise<PaginatedResult<TDomain>> {
		const { maxItems = 100, nextPageToken, sortField = '_id', sortOrder = SortOrder.DESC } = options;

		// Parse and apply pagination cursor if provided
		if (nextPageToken) {
			const cursor = this.decodeCursor(nextPageToken);
			this.applyCursorToFilter(filter, cursor, sortField, sortOrder);
		}

		// Convert sort order to MongoDB format
		const mongoSortOrder: 1 | -1 = sortOrder === SortOrder.ASC ? 1 : -1;

		// Build compound sort: primary field + _id
		const sort: Record<string, 1 | -1> = {
			[sortField]: mongoSortOrder,
			_id: mongoSortOrder // Always sort by _id as secondary to ensure deterministic ordering
		};

		// Fetch one more than requested to check if there are more results
		const limit = maxItems + 1;

		const projection = fields && fields.length > 0 ? fields.join(' ') : undefined;
		const documents = (await this.model.find(filter, projection).sort(sort).limit(limit).lean().exec()) as Array<
			Require_id<TDocument> & { __v: number }
		>;

		// Check if there are more results
		const hasMore = documents.length > maxItems;
		const resultDocuments = hasMore ? documents.slice(0, maxItems) : documents;

		// Transform documents to domain objects
		const items = resultDocuments.map((doc) => this.toDomain(doc));

		// Generate next page token (encode last document's sort field value and _id)
		const nextToken =
			hasMore && resultDocuments.length > 0
				? this.encodeCursor(resultDocuments[resultDocuments.length - 1], sortField)
				: undefined;

		return {
			items,
			isTruncated: hasMore,
			nextPageToken: nextToken
		};
	}

	/**
	 * Updates a document by a custom filter.
	 *
	 * @param filter - MongoDB query filter
	 * @param updateData - The data to update
	 * @returns The updated domain object
	 * @throws Error if document not found or update fails
	 */
	protected async updateOne(filter: FilterQuery<TDocument>, updateData: UpdateQuery<TDocument>): Promise<TDomain> {
		try {
			const document = (await this.model
				.findOneAndUpdate(filter, updateData, {
					new: true,
					runValidators: true,
					lean: true
				})
				.exec()) as (Require_id<TDocument> & { __v: number }) | null;

			if (!document) {
				this.logger.error('No document found to update with filter:', filter);
				throw new Error('Document not found for update');
			}

			this.logger.debug(`Document with ID '${document._id}' updated`);
			return this.toDomain(document);
		} catch (error) {
			this.logger.error('Error updating document:', error);
			throw error;
		}
	}

	/**
	 * Deletes a document by a custom filter.
	 *
	 * @param filter - MongoDB query filter
	 * @throws Error if no document was found or deleted
	 */
	protected async deleteOne(filter: FilterQuery<TDocument>): Promise<void> {
		try {
			const result = await this.model.findOneAndDelete(filter).exec();

			if (!result) {
				this.logger.error('No document found to delete with filter:', filter);
				throw new Error('Document not found for deletion');
			}

			this.logger.debug(`Document with ID '${result._id}' deleted`);
		} catch (error) {
			this.logger.error('Error deleting document:', error);
			throw error;
		}
	}

	/**
	 * Deletes multiple documents matching the given filter.
	 *
	 * @param filter - MongoDB query filter
	 * @param failIfEmpty - Whether to throw error if no documents are found (default: true)
	 * @throws Error if no documents were found or deleted (only when failIfEmpty is true)
	 */
	protected async deleteMany(filter: FilterQuery<TDocument> = {}, failIfEmpty = true): Promise<void> {
		try {
			const result = await this.model.deleteMany(filter).exec();
			const deletedCount = result.deletedCount || 0;

			if (deletedCount === 0) {
				this.logger.error('No documents found to delete with filter:', filter);

				if (failIfEmpty) {
					throw new Error('No documents found for deletion');
				}
			} else {
				this.logger.debug(`Deleted ${deletedCount} documents`);
			}
		} catch (error) {
			if (error instanceof Error && error.message === 'No documents found for deletion') {
				throw error;
			}

			this.logger.error('Error deleting documents:', error);
			throw error;
		}
	}

	/**
	 * Counts the total number of documents matching the given filter.
	 *
	 * @param filter - MongoDB query filter (optional, defaults to counting all documents)
	 * @returns The number of documents matching the filter
	 */
	protected async count(filter: FilterQuery<TDocument> = {}): Promise<number> {
		try {
			return await this.model.countDocuments(filter).exec();
		} catch (error) {
			this.logger.error('Error counting documents:', error);
			throw error;
		}
	}

	// ==========================================
	// PAGINATION HELPER METHODS
	// ==========================================

	/**
	 * Encodes a cursor for pagination.
	 * Creates a base64-encoded token containing the last document's sort field value and _id.
	 * Handles undefined/null values by converting them to null for consistent serialization.
	 *
	 * @param document - The last document from the current page
	 * @param sortField - The field used for sorting
	 * @returns Base64-encoded cursor token
	 */
	protected encodeCursor(document: Require_id<TDocument> & { __v: number }, sortField: string): string {
		const fieldValue = document[sortField as keyof Require_id<TDocument>];

		const cursor: PaginationCursor = {
			// Convert undefined to null for JSON serialization
			fieldValue: fieldValue === undefined ? null : fieldValue,
			id: String(document._id)
		};

		return Buffer.from(JSON.stringify(cursor)).toString('base64');
	}

	/**
	 * Decodes a pagination cursor token.
	 *
	 * @param token - The base64-encoded cursor token
	 * @returns Decoded cursor object with fieldValue and id
	 * @throws Error if the token is invalid or malformed
	 */
	protected decodeCursor(token: string): PaginationCursor {
		try {
			const decoded = Buffer.from(token, 'base64').toString('utf-8');
			const cursor = JSON.parse(decoded);

			if (
				!Object.prototype.hasOwnProperty.call(cursor, 'fieldValue') ||
				!Object.prototype.hasOwnProperty.call(cursor, 'id')
			) {
				throw new Error('Invalid cursor format');
			}

			return cursor;
		} catch (error) {
			this.logger.error('Failed to decode pagination cursor:', error);
			throw new Error('Invalid pagination token');
		}
	}

	/**
	 * Applies cursor-based pagination to the MongoDB filter.
	 * Uses compound comparison to handle non-unique sort fields correctly.
	 * Handles missing/undefined fields properly in MongoDB queries.
	 *
	 * For ascending order:
	 *   (sortField > cursor.fieldValue) OR (sortField = cursor.fieldValue AND _id > cursor.id)
	 *
	 * For descending order:
	 *   (sortField < cursor.fieldValue) OR (sortField = cursor.fieldValue AND _id < cursor.id)
	 *
	 * Special handling for null/undefined values (missing fields):
	 * - In ascending order, missing fields come first in MongoDB's sort order
	 * - In descending order, missing fields come last
	 * - We use $exists: false to check for missing fields instead of comparing with null
	 *
	 * @param filter - The MongoDB filter to modify
	 * @param cursor - The decoded cursor
	 * @param sortField - The field used for sorting
	 * @param sortOrder - The sort order ('asc' or 'desc')
	 */
	protected applyCursorToFilter(
		filter: FilterQuery<TDocument>,
		cursor: PaginationCursor,
		sortField: string,
		sortOrder: SortOrder
	): void {
		const comparison = sortOrder === SortOrder.ASC ? '$gt' : '$lt';
		const equalComparison = sortOrder === SortOrder.ASC ? '$gt' : '$lt';

		// Build compound filter for pagination
		// This ensures correct ordering even when sortField values are not unique
		const orConditions: FilterQuery<TDocument>[] = [];

		// If cursor field value is null (field doesn't exist in the document)
		if (cursor.fieldValue === null) {
			// For missing fields, we filter by _id among documents where the field doesn't exist
			orConditions.push({
				[sortField]: { $exists: false },
				_id: { [equalComparison]: cursor.id }
			} as FilterQuery<TDocument>);

			// In ascending order, also include documents where the field exists (they come after missing fields)
			if (sortOrder === SortOrder.ASC) {
				orConditions.push({
					[sortField]: { $exists: true }
				} as FilterQuery<TDocument>);
			}
		} else {
			// Normal case: field has a value
			orConditions.push(
				{
					[sortField]: { [comparison]: cursor.fieldValue }
				} as FilterQuery<TDocument>,
				{
					[sortField]: cursor.fieldValue,
					_id: { [equalComparison]: cursor.id }
				} as FilterQuery<TDocument>
			);

			// In descending order, also include documents where the field doesn't exist (they come after all values)
			if (sortOrder === SortOrder.DESC) {
				orConditions.push({
					[sortField]: { $exists: false }
				} as FilterQuery<TDocument>);
			}
		}

		Object.assign(filter, { $or: orConditions });
	}
}
