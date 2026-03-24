import type { MeetUser, MeetUserField, MeetUserFilters } from '@openvidu-meet/typings';
import { SortOrder, TextMatchMode } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { QueryFilter } from 'mongoose';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type { MeetUserDocument, MeetUserDocumentOnlyField } from '../models/mongoose-schemas/user.schema.js';
import { MEET_USER_DOCUMENT_ONLY_FIELDS, MeetUserModel } from '../models/mongoose-schemas/user.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { buildStringMatchFilter } from '../utils/string-match-filter.utils.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetUser entities in MongoDB.
 * Provides CRUD operations and specialized queries for user data.
 */
@injectable()
export class UserRepository extends BaseRepository<MeetUser, MeetUserDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetUserModel);
	}

	protected toDomain(dbObject: MeetUserDocument): MeetUser {
		const { schemaVersion, ...user } = dbObject;
		void schemaVersion;
		return user as MeetUser;
	}

	protected override getDocumentOnlyFields(): readonly MeetUserDocumentOnlyField[] {
		return MEET_USER_DOCUMENT_ONLY_FIELDS;
	}

	/**
	 * Creates a new user.
	 *
	 * @param user - The user data to create
	 * @returns The created user
	 */
	create(user: MeetUser): Promise<MeetUser> {
		const document: MeetUserDocument = {
			...user,
			schemaVersion: INTERNAL_CONFIG.USER_SCHEMA_VERSION
		};
		return this.createDocument(document);
	}

	/**
	 * Updates specific fields of a user without replacing the entire document.
	 *
	 * @param userId - The user identifier
	 * @param fieldsToUpdate - Partial user data with fields to update
	 * @returns The updated user
	 * @throws Error if user not found
	 */
	updatePartial(userId: string, fieldsToUpdate: Partial<MeetUser>): Promise<MeetUser> {
		return this.updatePartialOne({ userId }, fieldsToUpdate);
	}

	/**
	 * Replaces an existing user with new data.
	 *
	 * @param user - The complete updated user data
	 * @returns The updated user
	 * @throws Error if user not found
	 */
	replace(user: MeetUser): Promise<MeetUser> {
		return this.replaceOne({ userId: user.userId }, user);
	}

	/**
	 * Finds a user by their userId.
	 *
	 * @param userId - The unique user identifier
	 * @param fields - Array of field names to include in the result
	 * @returns The user or null if not found
	 */
	findByUserId(userId: string, fields?: MeetUserField[]): Promise<MeetUser | null> {
		return this.findOne({ userId }, fields);
	}

	/**
	 * Finds users by their userIds.
	 *
	 * @param userIds - Array of user identifiers
	 * @param fields - Optional array of field names to include in the result
	 * @returns Array of found users
	 */
	findByUserIds(userIds: string[], fields?: MeetUserField[]): Promise<MeetUser[]> {
		return this.findAll({ userId: { $in: userIds } }, fields);
	}

	/**
	 * Finds users with optional filtering, pagination, and sorting.
	 *
	 * @param options - Query options
	 * @param options.userId - Optional user ID to filter by (exact match)
	 * @param options.name - Optional name to filter by
	 * @param options.nameMatchMode - Match mode for name filtering (default: 'exact')
	 * @param options.nameCaseInsensitive - Whether name filtering should ignore case (default: false)
	 * @param options.role - Optional role to filter by
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination
	 * @param options.sortField - Field to sort by (default: 'registrationDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing users array, pagination info, and optional next page token
	 */
	async find(options: MeetUserFilters = {}): Promise<{
		users: MeetUser[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const {
			userId,
			name,
			nameMatchMode = TextMatchMode.EXACT,
			nameCaseInsensitive = false,
			role,
			maxItems = 100,
			nextPageToken,
			sortField = 'registrationDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: QueryFilter<MeetUserDocument> = {};

		if (userId && name) {
			// When both are provided, return users matching either userId (exact) or name criteria.
			filter.$or = [
				{ userId },
				{ name: buildStringMatchFilter(name, nameMatchMode, nameCaseInsensitive) }
			];
		} else if (userId) {
			filter.userId = userId;
		} else if (name) {
			filter.name = buildStringMatchFilter(name, nameMatchMode, nameCaseInsensitive);
		}

		if (role) {
			filter.role = role;
		}

		// Use base repository's pagination method
		const result = await this.findMany(filter, {
			maxItems,
			nextPageToken,
			sortField,
			sortOrder
		});

		return {
			users: result.items,
			isTruncated: result.isTruncated,
			nextPageToken: result.nextPageToken
		};
	}

	/**
	 * Deletes a user by their userId.
	 *
	 * @param userId - The unique user identifier
	 * @throws Error if the user was not found or could not be deleted
	 */
	deleteByUserId(userId: string): Promise<void> {
		return this.deleteOne({ userId });
	}

	/**
	 * Deletes multiple users by their userIds.
	 *
	 * @param userIds - Array of user identifiers
	 * @throws Error if no users were found or could not be deleted
	 */
	deleteByUserIds(userIds: string[]): Promise<void> {
		return this.deleteMany({ userId: { $in: userIds } });
	}
}
