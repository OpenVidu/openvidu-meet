import { MeetRoomMember, MeetRoomMemberFilters, MeetRoomMemberPermissions, SortOrder } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { FilterQuery, Require_id } from 'mongoose';
import { MeetRoomMemberDocument, MeetRoomMemberModel } from '../models/mongoose-schemas/room-member.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetRoomMember entities in MongoDB.
 * Provides CRUD operations and specialized queries for room member data.
 */
@injectable()
export class RoomMemberRepository extends BaseRepository<MeetRoomMember, MeetRoomMemberDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetRoomMemberModel);
	}

	protected toDomain(dbObject: Require_id<MeetRoomMemberDocument> & { __v: number }): MeetRoomMember {
		const { _id, __v, schemaVersion, ...member } = dbObject;
		(void _id, __v, schemaVersion);
		return member as MeetRoomMember;
	}

	/**
	 * Adds a member to a room.
	 *
	 * @param member - The room member data to add
	 * @returns The created room member
	 */
	async create(member: MeetRoomMember): Promise<MeetRoomMember> {
		return this.createDocument(member);
	}

	/**
	 * Updates an existing room member.
	 *
	 * @param member - The complete updated room member data
	 * @returns The updated room member
	 * @throws Error if room member not found
	 */
	async update(member: MeetRoomMember): Promise<MeetRoomMember> {
		return this.updateOne({ roomId: member.roomId, memberId: member.memberId }, member);
	}

	/**
	 * Finds a specific member in a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @returns The room member or null if not found
	 */
	async findByRoomAndMemberId(roomId: string, memberId: string): Promise<MeetRoomMember | null> {
		return this.findOne({ roomId, memberId });
	}

	/**
	 * Finds room members by their memberIds.
	 *
	 * @param roomId - The ID of the room
	 * @param memberIds - Array of member identifiers
	 * @param fields - Array of field names to include in the result
	 * @returns Array of found room members
	 */
	async findByRoomAndMemberIds(roomId: string, memberIds: string[], fields?: string[]): Promise<MeetRoomMember[]> {
		return this.findAll({ roomId, memberId: { $in: memberIds } }, fields);
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
		members: MeetRoomMember[];
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
		const filter: FilterQuery<MeetRoomMemberDocument> = { roomId };

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
