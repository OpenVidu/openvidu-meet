import { MeetUser, MeetUserFilters } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetUserDocument, MeetUserModel } from '../models/mongoose-schemas/user.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetUser entities in MongoDB.
 * Provides CRUD operations and specialized queries for user data.
 *
 * @template TUser - The domain type extending MeetUser (default: MeetUser)
 */
@injectable()
export class UserRepository<TUser extends MeetUser = MeetUser> extends BaseRepository<TUser, MeetUserDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetUserModel);
	}

	/**
	 * Transforms a MongoDB document into a domain user object.
	 *
	 * @param document - The MongoDB document
	 * @returns User domain object
	 */
	protected toDomain(document: MeetUserDocument): TUser {
		return document.toObject() as TUser;
	}

	/**
	 * Creates a new user.
	 *
	 * @param user - The user data to create
	 * @returns The created user
	 */
	async create(user: TUser): Promise<TUser> {
		const document = await this.createDocument(user);
		return this.toDomain(document);
	}

	/**
	 * Updates an existing user.
	 *
	 * @param user - The complete updated user data
	 * @returns The updated user
	 * @throws Error if user not found
	 */
	async update(user: TUser): Promise<TUser> {
		const document = await this.updateOne({ userId: user.userId }, user);
		return this.toDomain(document);
	}

	/**
	 * Finds a user by their userId.
	 *
	 * @param userId - The unique user identifier
	 * @returns The user or null if not found
	 */
	async findByUserId(userId: string): Promise<TUser | null> {
		const document = await this.findOne({ userId });
		return document ? this.toDomain(document) : null;
	}

	/**
	 * Finds users by their userIds.
	 *
	 * @param userIds - Array of user identifiers
	 * @returns Array of found users
	 */
	async findByUserIds(userIds: string[]): Promise<TUser[]> {
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
		users: TUser[];
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
			sortOrder = 'desc'
		} = options;

		// Build base filter
		const filter: Record<string, unknown> = {};

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
