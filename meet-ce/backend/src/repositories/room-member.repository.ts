import { MeetRoomMember, MeetRoomMemberFilters, MeetRoomMemberPermissions, SortOrder } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetRoomMemberDocument, MeetRoomMemberModel } from '../models/mongoose-schemas/room-member.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetRoomMember entities in MongoDB.
 * Handles the storage and retrieval of room members.
 */
@injectable()
export class RoomMemberRepository<TRoomMember extends MeetRoomMember = MeetRoomMember> extends BaseRepository<
	TRoomMember,
	MeetRoomMemberDocument
> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetRoomMemberModel);
	}

	/**
	 * Transforms a MongoDB document into a domain room member object.
	 *
	 * @param document - The MongoDB document
	 * @returns Room member with computed permissions
	 */
	protected toDomain(document: MeetRoomMemberDocument): TRoomMember {
		return document.toObject() as TRoomMember;
	}

	/**
	 * Adds a member to a room.
	 *
	 * @param member - The room member data to add
	 * @returns The created room member
	 */
	async create(member: TRoomMember): Promise<TRoomMember> {
		const document = await this.createDocument(member as TRoomMember);
		return this.toDomain(document);
	}

	/**
	 * Updates an existing room member.
	 *
	 * @param member - The complete updated room member data
	 * @returns The updated room member
	 * @throws Error if room member not found
	 */
	async update(member: TRoomMember): Promise<TRoomMember> {
		const document = await this.updateOne({ roomId: member.roomId, memberId: member.memberId }, member);
		return this.toDomain(document);
	}

	/**
	 * Finds a specific member in a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @returns The room member or null if not found
	 */
	async findByRoomAndMemberId(roomId: string, memberId: string): Promise<TRoomMember | null> {
		const document = await this.findOne({ roomId, memberId });
		return document ? this.toDomain(document) : null;
	}

	/**
	 * Finds room members by their memberIds.
	 *
	 * @param roomId - The ID of the room
	 * @param memberIds - Array of member identifiers
	 * @param fields - Array of field names to include in the result
	 * @returns Array of found room members
	 */
	async findByRoomAndMemberIds(roomId: string, memberIds: string[], fields?: string[]): Promise<TRoomMember[]> {
		return await this.findAll({ roomId, memberId: { $in: memberIds } }, fields);
	}

	/**
	 * Gets all room IDs where a user is a member.
	 *
	 * @param memberId - The ID of the member (userId)
	 * @returns Array of room IDs where the user is a member
	 */
	async getRoomIdsByMemberId(memberId: string): Promise<string[]> {
		const members = await this.findAll({ memberId }, ['roomId']);
		return members.map((m) => m.roomId);
	}

	/**
	 * Gets all room IDs where a member has a specific permission enabled.
	 *
	 * @param memberId - The ID of the member (userId)
	 * @param permission - The permission key to check
	 * @returns Array of room IDs where the member has the specified permission
	 */
	async getRoomIdsByMemberIdWithPermission(
		memberId: string,
		permission: keyof MeetRoomMemberPermissions
	): Promise<string[]> {
		const members = await this.findAll(
			{
				memberId,
				[`effectivePermissions.${permission}`]: true
			},
			['roomId']
		);
		return members.map((member) => member.roomId);
	}

	/**
	 * Finds members of a room with optional filtering, pagination, and sorting.
	 *
	 * @param roomId - The ID of the room
	 * @param options - Query options
	 * @param options.name - Optional member name to filter by (case-insensitive partial match)
	 * @param options.fields - Array of field names to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination
	 * @param options.sortField - Field to sort by (default: 'membershipDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing members array, pagination info, and optional next page token
	 */
	async findByRoomId(
		roomId: string,
		options: MeetRoomMemberFilters = {}
	): Promise<{
		members: TRoomMember[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const {
			name,
			fields,
			maxItems = 100,
			nextPageToken,
			sortField = 'membershipDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: Record<string, unknown> = { roomId };

		if (name) {
			filter.name = new RegExp(name, 'i');
		}

		// Use base repository's pagination method
		const result = await this.findMany(
			filter,
			{
				maxItems,
				nextPageToken,
				sortField,
				sortOrder
			},
			fields
		);

		return {
			members: result.items,
			isTruncated: result.isTruncated,
			nextPageToken: result.nextPageToken
		};
	}

	/**
	 * Removes a member from a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member to remove
	 * @throws Error if room member not found or could not be deleted
	 */
	async deleteByRoomAndMemberId(roomId: string, memberId: string): Promise<void> {
		await this.deleteOne({ roomId, memberId });
	}

	/**
	 * Removes multiple members from a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberIds - Array of member IDs to remove
	 * @throws Error if no room members were found or could not be deleted
	 */
	async deleteByRoomIdAndMemberIds(roomId: string, memberIds: string[]): Promise<void> {
		await this.deleteMany({ roomId, memberId: { $in: memberIds } });
	}

	/**
	 * Removes all members from a room.
	 * Does not fail if no members are found.
	 *
	 * @param roomId - The ID of the room
	 */
	async deleteAllByRoomId(roomId: string): Promise<void> {
		await this.deleteMany({ roomId }, false);
	}

	/**
	 * Removes all room memberships for a specific member across all rooms.
	 * This is useful when deleting a user account.
	 * Does not fail if no memberships are found.
	 *
	 * @param memberId - The ID of the member whose memberships should be deleted
	 */
	async deleteAllByMemberId(memberId: string): Promise<void> {
		await this.deleteMany({ memberId }, false);
	}
}
