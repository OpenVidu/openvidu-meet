import { SortAndPagination } from '@openvidu-meet/typings';
import { inject, injectable, unmanaged } from 'inversify';
import { Document, FilterQuery, Model, UpdateQuery } from 'mongoose';
import { PaginatedResult, PaginationCursor } from '../models/db-pagination.model.js';
import { LoggerService } from '../services/logger.service.js';

/**
 * Base repository providing common CRUD operations for MongoDB entities.
 * This class is meant to be extended by specific entity repositories.
 *
 * @template TDomain - The domain interface type
 * @template TDocument - The Mongoose document type extending Document
 */
@injectable()
export abstract class BaseRepository<TDomain, TDocument extends Document> {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@unmanaged() protected model: Model<TDocument>
	) {}

	/**
	 * Transforms a document into a domain object.
	 * Must be implemented by each concrete repository to handle entity-specific transformations.
	 *
	 * @param document - The MongoDB document to transform
	 * @returns The domain object
	 */
	protected abstract toDomain(document: TDocument): TDomain;

	/**
	 * Finds a single document matching the given filter.
	 * @param filter - MongoDB query filter
	 * @param fields - Optional comma-separated list of fields to select from database
	 * @returns The document or null if not found
	 */
	protected async findOne(filter: FilterQuery<TDocument>, fields?: string): Promise<TDocument | null> {
		try {
			let query = this.model.findOne(filter);

			if (fields) {
				const fieldSelection = fields
					.split(',')
					.map((field) => field.trim())
					.filter((field) => field !== '')
					.join(' ');
				query = query.select(fieldSelection);
			}

			return await query.exec();
		} catch (error) {
			this.logger.error('Error finding document with filter:', filter, error);
			throw error;
		}
	}

	/**
	 * Finds all documents matching the given filter without pagination.
	 * Useful for queries where you need all matching documents.
	 *
	 * WARNING: Use with caution on large collections. Consider using findMany() with pagination instead.
	 *
	 * @param filter - Base MongoDB query filter
	 * @param fields - Optional comma-separated list of fields to select from database
	 * @returns Array of domain objects matching the filter
	 */
	protected async findAll(filter: FilterQuery<TDocument> = {}, fields?: string): Promise<TDomain[]> {
		try {
			let query = this.model.find(filter);

			if (fields) {
				const fieldSelection = fields
					.split(',')
					.map((field) => field.trim())
					.filter((field) => field !== '')
					.join(' ');
				query = query.select(fieldSelection);
			}

			// Transform documents to domain objects
			const documents = await query.exec();
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
	 * @param options.sortField - Field to sort by (default: 'createdAt')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @param fields - Optional comma-separated list of fields to select from database
	 * @returns Paginated result with items, truncation flag, and optional next token
	 */
	protected async findMany(
		filter: FilterQuery<TDocument> = {},
		options: SortAndPagination = {},
		fields?: string
	): Promise<PaginatedResult<TDomain>> {
		const { maxItems = 100, nextPageToken, sortField = '_id', sortOrder = 'desc' } = options;

		// Parse and apply pagination cursor if provided
		if (nextPageToken) {
			const cursor = this.decodeCursor(nextPageToken);
			this.applyCursorToFilter(filter, cursor, sortField, sortOrder);
		}

		// Convert sort order to MongoDB format
		const mongoSortOrder: 1 | -1 = sortOrder === 'asc' ? 1 : -1;

		// Build compound sort: primary field + _id
		const sort: Record<string, 1 | -1> = {
			[sortField]: mongoSortOrder,
			_id: mongoSortOrder // Always sort by _id as secondary to ensure deterministic ordering
		};

		// Fetch one more than requested to check if there are more results
		const limit = maxItems + 1;

		// Build query
		let query = this.model.find(filter).sort(sort).limit(limit);

		// Apply field selection if specified
		if (fields) {
			// Convert comma-separated string to space-separated format for MongoDB select()
			const fieldSelection = fields
				.split(',')
				.map((field) => field.trim())
				.filter((field) => field !== '')
				.join(' ');

			query = query.select(fieldSelection);
		}

		const documents = await query.exec();

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
	 * Creates a new document.
	 * @param data - The data to create
	 * @returns The created document
	 */
	protected async createDocument(data: TDomain): Promise<TDocument> {
		try {
			const document = await this.model.create(data);
			this.logger.debug(`Document created with id: ${document._id}`);
			return document;
		} catch (error) {
			this.logger.error('Error creating document:', error);
			throw error;
		}
	}

	/**
	 * Updates a document by a custom filter.
	 * @param filter - MongoDB query filter
	 * @param updateData - The data to update
	 * @returns The updated document
	 * @throws Error if document not found or update fails
	 */
	protected async updateOne(filter: FilterQuery<TDocument>, updateData: UpdateQuery<TDocument>): Promise<TDocument> {
		try {
			const document = await this.model
				.findOneAndUpdate(filter, updateData, {
					new: true,
					runValidators: true
				})
				.exec();

			if (!document) {
				this.logger.error('No document found to update with filter:', filter);
				throw new Error('Document not found for update');
			}

			this.logger.debug('Document updated');
			return document;
		} catch (error) {
			this.logger.error('Error updating document:', error);
			throw error;
		}
	}

	/**
	 * Deletes a document by a custom filter.
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

			this.logger.debug('Document deleted');
		} catch (error) {
			this.logger.error('Error deleting document:', error);
			throw error;
		}
	}

	/**
	 * Deletes multiple documents matching the given filter.
	 * @param filter - MongoDB query filter
	 * @throws Error if no documents were found or deleted
	 */
	protected async deleteMany(filter: FilterQuery<TDocument> = {}): Promise<void> {
		try {
			const result = await this.model.deleteMany(filter).exec();
			const deletedCount = result.deletedCount || 0;

			if (deletedCount === 0) {
				this.logger.error('No documents found to delete with filter:', filter);
				throw new Error('No documents found for deletion');
			}

			this.logger.debug(`Deleted ${deletedCount} documents`);
		} catch (error) {
			this.logger.error('Error deleting documents:', error);
			throw error;
		}
	}

	/**
	 * Counts the total number of documents matching the given filter.
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
	protected encodeCursor(document: TDocument, sortField: string): string {
		const fieldValue = document.get(sortField);

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
		sortOrder: 'asc' | 'desc'
	): void {
		const comparison = sortOrder === 'asc' ? '$gt' : '$lt';
		const equalComparison = sortOrder === 'asc' ? '$gt' : '$lt';

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
			if (sortOrder === 'asc') {
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
			if (sortOrder === 'desc') {
				orConditions.push({
					[sortField]: { $exists: false }
				} as FilterQuery<TDocument>);
			}
		}

		Object.assign(filter, { $or: orConditions });
	}
}
