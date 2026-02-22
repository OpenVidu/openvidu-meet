import { MeetUser, MeetUserFilters, SortOrder } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { FilterQuery, Require_id } from 'mongoose';
import { MeetUserDocument, MeetUserModel } from '../models/mongoose-schemas/user.schema.js';
import { LoggerService } from '../services/logger.service.js';
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

	protected toDomain(dbObject: Require_id<MeetUserDocument> & { __v: number }): MeetUser {
		const { _id, __v, schemaVersion, ...user } = dbObject;
		(void _id, __v, schemaVersion);
		return user as MeetUser;
	}

	/**
	 * Creates a new user.
	 *
	 * @param user - The user data to create
	 * @returns The created user
	 */
	async create(user: MeetUser): Promise<MeetUser> {
		return this.createDocument(user);
	}

	/**
	 * Updates an existing user.
	 *
	 * @param user - The complete updated user data
	 * @returns The updated user
	 * @throws Error if user not found
	 */
	async update(user: MeetUser): Promise<MeetUser> {
		return this.updateOne({ userId: user.userId }, user);
	}

	/**
	 * Finds a user by their userId.
	 *
	 * @param userId - The unique user identifier
	 * @returns The user or null if not found
	 */
	async findByUserId(userId: string): Promise<MeetUser | null> {
		return this.findOne({ userId });
	}

	/**
	 * Finds users by their userIds.
	 *
	 * @param userIds - Array of user identifiers
	 * @returns Array of found users
	 */
	async findByUserIds(userIds: string[]): Promise<MeetUser[]> {
		return await this.findAll({ userId: { $in: userIds } });
	}

	/**
	 * Finds users with optional filtering, pagination, and sorting.
	 *
	 * @param options - Query options
	 * @param options.userId - Optional user ID to filter by (case-insensitive partial match)
	 * @param options.name - Optional name to filter by (case-insensitive partial match)
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
			role,
			maxItems = 100,
			nextPageToken,
			sortField = 'registrationDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: FilterQuery<MeetUserDocument> = {};

		if (userId && name) {
			// Both defined: OR filter with regex userId match and regex name match
			filter.$or = [{ userId: new RegExp(userId, 'i') }, { name: new RegExp(name, 'i') }];
		} else if (userId) {
			// Only userId defined: regex match (case-insensitive)
			filter.userId = new RegExp(userId, 'i');
		} else if (name) {
			// Only name defined: regex match (case-insensitive)
			filter.name = new RegExp(name, 'i');
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
	async deleteByUserId(userId: string): Promise<void> {
		await this.deleteOne({ userId });
	}

	/**
	 * Deletes multiple users by their userIds.
	 *
	 * @param userIds - Array of user identifiers
	 * @throws Error if no users were found or could not be deleted
	 */
	async deleteByUserIds(userIds: string[]): Promise<void> {
		await this.deleteMany({ userId: { $in: userIds } });
	}
}
