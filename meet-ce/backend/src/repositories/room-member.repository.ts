import type { MeetRoomMember, MeetRoomMemberField, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { SortOrder } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { QueryFilter, Require_id } from 'mongoose';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type {
	MeetRoomMemberDocument,
	MeetRoomMemberDocumentOnlyField
} from '../models/mongoose-schemas/room-member.schema.js';
import {
	MEET_ROOM_MEMBER_DOCUMENT_ONLY_FIELDS,
	MeetRoomMemberModel
} from '../models/mongoose-schemas/room-member.schema.js';
import { LoggerService } from '../services/logger.service.js';
import type {
	MeetRoomMemberPage,
	MeetRoomMemberQueryWithFields,
	ProjectedMeetRoomMember,
	RoomMemberQuery,
	RoomMemberQueryWithProjection
} from '../types/room-member-projection.types.js';
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

	protected override getDocumentOnlyFields(): readonly MeetRoomMemberDocumentOnlyField[] {
		return MEET_ROOM_MEMBER_DOCUMENT_ONLY_FIELDS;
	}

	/**
	 * Adds a member to a room.
	 *
	 * @param member - The room member data to add
	 * @returns The created room member
	 */
	async create(member: MeetRoomMember): Promise<MeetRoomMember> {
		const document: MeetRoomMemberDocument = {
			...member,
			schemaVersion: INTERNAL_CONFIG.ROOM_MEMBER_SCHEMA_VERSION
		};
		return this.createDocument(document);
	}

	/**
	 * Updates specific fields of a room member without replacing the entire document.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @param fieldsToUpdate - Partial member data with fields to update
	 * @returns The updated room member
	 * @throws Error if room member not found
	 */
	async updatePartial(
		roomId: string,
		memberId: string,
		fieldsToUpdate: Partial<MeetRoomMember>
	): Promise<MeetRoomMember> {
		return this.updatePartialOne({ roomId, memberId }, fieldsToUpdate);
	}

	/**
	 * Replaces an existing room member with new data.
	 *
	 * @param member - The complete updated room member data
	 * @returns The updated room member
	 * @throws Error if room member not found
	 */
	async replace(member: MeetRoomMember): Promise<MeetRoomMember> {
		return this.replaceOne({ roomId: member.roomId, memberId: member.memberId }, member);
	}

	/**
	 * Finds a specific member in a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @param fields - Array of field names to include in the result
	 * @returns The room member or null if not found
	 */
	async findByRoomAndMemberId(roomId: string, memberId: string): Promise<MeetRoomMember | null>;

	async findByRoomAndMemberId<const TFields extends readonly MeetRoomMemberField[]>(
		roomId: string,
		memberId: string,
		fields: TFields
	): Promise<ProjectedMeetRoomMember<TFields> | null>;

	async findByRoomAndMemberId(
		roomId: string,
		memberId: string,
		fields?: readonly MeetRoomMemberField[]
	): Promise<MeetRoomMember | Partial<MeetRoomMember> | null>;

	async findByRoomAndMemberId(
		roomId: string,
		memberId: string,
		fields?: readonly MeetRoomMemberField[]
	): Promise<MeetRoomMember | Partial<MeetRoomMember> | null> {
		return this.findOne({ roomId, memberId }, fields as string[]) as Promise<
			MeetRoomMember | Partial<MeetRoomMember> | null
		>;
	}

	/**
	 * Finds room members by their memberIds.
	 *
	 * @param roomId - The ID of the room
	 * @param memberIds - Array of member identifiers
	 * @param fields - Array of field names to include in the result
	 * @returns Array of found room members
	 */
	async findByRoomAndMemberIds(roomId: string, memberIds: string[]): Promise<MeetRoomMember[]>;

	async findByRoomAndMemberIds<const TFields extends readonly MeetRoomMemberField[]>(
		roomId: string,
		memberIds: string[],
		fields: TFields
	): Promise<ProjectedMeetRoomMember<TFields>[]>;

	async findByRoomAndMemberIds(
		roomId: string,
		memberIds: string[],
		fields?: readonly MeetRoomMemberField[]
	): Promise<MeetRoomMember[] | Partial<MeetRoomMember>[]> {
		return this.findAll({ roomId, memberId: { $in: memberIds } }, fields as string[]) as Promise<
			MeetRoomMember[] | Partial<MeetRoomMember>[]
		>;
	}

	/**
	 * Gets all room IDs where a user is a member, optionally filtered by permission.
	 *
	 * @param memberId - The ID of the member (userId)
	 * @param permission - Optional permission key to filter memberships
	 * @returns Array of room IDs where the user is a member and has the permission (if provided)
	 */
	async getRoomIdsByMemberId(memberId: string, permission?: keyof MeetRoomMemberPermissions): Promise<string[]> {
		const filter: QueryFilter<MeetRoomMemberDocument> = { memberId };

		if (permission) {
			filter[`effectivePermissions.${permission}`] = true;
		}

		const documents = await this.model
			.aggregate<{ roomId: string }>([{ $match: filter }, { $project: { _id: 0, roomId: 1 } }])
			.exec();

		return documents.map((doc) => doc.roomId);
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
	async findByRoomId(roomId: string, options?: RoomMemberQuery): Promise<MeetRoomMemberPage<MeetRoomMember>>;

	async findByRoomId<const TFields extends readonly MeetRoomMemberField[]>(
		roomId: string,
		options: RoomMemberQueryWithProjection<TFields>
	): Promise<MeetRoomMemberPage<ProjectedMeetRoomMember<TFields>>>;

	async findByRoomId(
		roomId: string,
		options: MeetRoomMemberQueryWithFields
	): Promise<MeetRoomMemberPage<MeetRoomMember | Partial<MeetRoomMember>>>;

	async findByRoomId(
		roomId: string,
		options: MeetRoomMemberQueryWithFields = {}
	): Promise<MeetRoomMemberPage<MeetRoomMember | Partial<MeetRoomMember>>> {
		const {
			name,
			fields,
			maxItems = 100,
			nextPageToken,
			sortField = 'membershipDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: QueryFilter<MeetRoomMemberDocument> = { roomId };

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
			fields as string[]
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
