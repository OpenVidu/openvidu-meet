import { User } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';
import { MeetUserDocument, MeetUserModel } from './schemas/user.schema.js';

/**
 * Repository for managing User entities in MongoDB.
 * Provides CRUD operations and specialized queries for user data.
 *
 * @template TUser - The domain type extending User (default: User)
 */
@injectable()
export class UserRepository<TUser extends User = User> extends BaseRepository<TUser, MeetUserDocument> {
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
	 * @param user - The complete updated user data (must include username)
	 * @returns The updated user
	 * @throws Error if user not found
	 */
	async update(user: TUser): Promise<TUser> {
		const document = await this.updateOne({ username: user.username }, user);
		return this.toDomain(document);
	}

	/**
	 * Finds a user by their username.
	 *
	 * @param username - The unique username identifier
	 * @returns The user or null if not found
	 */
	async findByUsername(username: string): Promise<TUser | null> {
		const document = await this.findOne({ username });
		return document ? this.toDomain(document) : null;
	}
}
