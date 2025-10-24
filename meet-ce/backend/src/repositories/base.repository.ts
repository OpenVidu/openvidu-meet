import { inject, injectable, unmanaged } from 'inversify';
import { Document, FilterQuery, Model, UpdateQuery } from 'mongoose';
import { LoggerService } from '../services/logger.service.js';

/**
 * Options for paginated find operations.
 */
export interface PaginatedFindOptions {
	maxItems?: number;
	nextPageToken?: string;
	sortField?: string;
	sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a paginated find operation.
 */
export interface PaginatedResult<T> {
	items: T[];
	isTruncated: boolean;
	nextPageToken?: string;
}

/**
 * Pagination cursor structure.
 */
interface PaginationCursor {
	fieldValue: unknown;
	id: string;
}

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
	 * @returns The document or null if not found
	 */
	protected async findOne(filter: FilterQuery<TDocument>): Promise<TDocument | null> {
		try {
			return await this.model.findOne(filter).exec();
		} catch (error) {
			this.logger.error('Error finding document with filter:', filter, error);
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
	 * @returns Paginated result with items, truncation flag, and optional next token
	 */
	protected async findMany(
		filter: FilterQuery<TDocument> = {},
		options: PaginatedFindOptions = {}
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

		const documents = await this.model.find(filter).sort(sort).limit(limit).exec();

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
	 * @returns The updated document or null if not found
	 */
	protected async updateOne(
		filter: FilterQuery<TDocument>,
		updateData: UpdateQuery<TDocument>
	): Promise<TDocument | null> {
		try {
			const document = await this.model
				.findOneAndUpdate(filter, updateData, {
					new: true,
					runValidators: true
				})
				.exec();

			if (document) {
				this.logger.debug('Document updated with filter');
			}

			return document;
		} catch (error) {
			this.logger.error('Error updating document with filter:', error);
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

			this.logger.debug('Document deleted with filter');
		} catch (error) {
			this.logger.error('Error deleting document with filter:', error);
			throw error;
		}
	}

	/**
	 * Deletes multiple documents matching the given filter.
	 * @param filter - MongoDB query filter
	 * @throws Error if no documents were found or deleted
	 */
	protected async deleteMany(filter: FilterQuery<TDocument>): Promise<void> {
		try {
			const result = await this.model.deleteMany(filter).exec();
			const deletedCount = result.deletedCount || 0;

			if (deletedCount === 0) {
				this.logger.error('No documents found to delete with filter:', filter);
				throw new Error('No documents found for deletion');
			}

			this.logger.debug(`Deleted ${deletedCount} documents`);
		} catch (error) {
			this.logger.error('Error deleting documents with filter:', error);
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
	 *
	 * @param document - The last document from the current page
	 * @param sortField - The field used for sorting
	 * @returns Base64-encoded cursor token
	 */
	protected encodeCursor(document: TDocument, sortField: string): string {
		const cursor: PaginationCursor = {
			fieldValue: document.get(sortField),
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
	 *
	 * For ascending order:
	 *   (sortField > cursor.fieldValue) OR (sortField = cursor.fieldValue AND _id > cursor.id)
	 *
	 * For descending order:
	 *   (sortField < cursor.fieldValue) OR (sortField = cursor.fieldValue AND _id < cursor.id)
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
		const orConditions: FilterQuery<TDocument>[] = [
			{
				[sortField]: { [comparison]: cursor.fieldValue }
			} as FilterQuery<TDocument>,
			{
				[sortField]: cursor.fieldValue,
				_id: { [equalComparison]: cursor.id }
			} as FilterQuery<TDocument>
		];

		Object.assign(filter, { $or: orConditions });
	}
}
