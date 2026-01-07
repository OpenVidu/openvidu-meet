import {
	MeetRoomMember,
	MeetRoomMemberFilters,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomRoles
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { errorRoomNotFound } from '../models/error.model.js';
import { MeetRoomMemberDocument, MeetRoomMemberModel } from '../models/mongoose-schemas/room-member.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';
import { RoomRepository } from './room.repository.js';

/**
 * Repository for managing MeetRoomMember entities in MongoDB.
 * Handles the storage and retrieval of room members.
 */
@injectable()
export class RoomMemberRepository extends BaseRepository<MeetRoomMember, MeetRoomMemberDocument> {
	private currentRoomRoles: MeetRoomRoles | undefined;

	constructor(
		@inject(LoggerService) logger: LoggerService,
		@inject(RoomRepository) private roomRepository: RoomRepository
	) {
		super(logger, MeetRoomMemberModel);
	}

	/**
	 * Transforms a MongoDB document into a domain room member object.
	 * Computes effective permissions based on base role and custom permissions.
	 *
	 * @param document - The MongoDB document
	 * @returns Room member with computed permissions
	 */
	protected toDomain(document: MeetRoomMemberDocument): MeetRoomMember {
		const doc = document.toObject();
		const effectivePermissions = this.computeEffectivePermissions(
			this.currentRoomRoles!,
			doc.baseRole,
			doc.customPermissions
		);

		return {
			...doc,
			effectivePermissions
		};
	}

	/**
	 * Adds a member to a room.
	 *
	 * @param member - The room member data to add
	 * @returns The created room member
	 */
	async create(member: MeetRoomMember): Promise<MeetRoomMember> {
		const room = await this.roomRepository.findByRoomId(member.roomId);

		if (!room) {
			throw errorRoomNotFound(member.roomId);
		}

		this.currentRoomRoles = room.roles;
		const document = await this.createDocument(member);
		const domain = this.toDomain(document);
		this.currentRoomRoles = undefined;
		return domain;
	}

	/**
	 * Updates an existing room member.
	 *
	 * @param member - The complete updated room member data
	 * @returns The updated room member
	 * @throws Error if room member not found
	 */
	async update(member: MeetRoomMember): Promise<MeetRoomMember> {
		const room = await this.roomRepository.findByRoomId(member.roomId);

		if (!room) {
			throw errorRoomNotFound(member.roomId);
		}

		this.currentRoomRoles = room.roles;
		const document = await this.updateOne({ roomId: member.roomId, memberId: member.memberId }, member);
		const domain = this.toDomain(document);
		this.currentRoomRoles = undefined;
		return domain;
	}

	/**
	 * Finds a specific member in a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @returns The room member or null if not found
	 */
	async findByRoomAndMemberId(roomId: string, memberId: string): Promise<MeetRoomMember | null> {
		const room = await this.roomRepository.findByRoomId(roomId);

		if (!room) {
			return null;
		}

		this.currentRoomRoles = room.roles;
		const document = await this.findOne({ roomId, memberId });
		const domain = document ? this.toDomain(document) : null;
		this.currentRoomRoles = undefined;
		return domain;
	}

	/**
	 * Finds room members by their memberIds.
	 *
	 * @param memberIds - Array of member identifiers
	 * @returns Array of found room members
	 */
	async findByRoomAndMemberIds(memberIds: string[]): Promise<MeetRoomMember[]> {
		return await this.findAll({ memberId: { $in: memberIds } });
	}

	/**
	 * Finds members of a room with optional filtering, pagination, and sorting.
	 *
	 * @param roomId - The ID of the room
	 * @param options - Query options
	 * @param options.name - Optional member name to filter by (case-insensitive partial match)
	 * @param options.fields - Comma-separated list of fields to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination
	 * @param options.sortField - Field to sort by (default: 'name')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'asc')
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
		const room = await this.roomRepository.findByRoomId(roomId);

		if (!room) {
			throw errorRoomNotFound(roomId);
		}

		this.currentRoomRoles = room.roles;

		const { name, fields, maxItems = 100, nextPageToken, sortField = 'name', sortOrder = 'asc' } = options;

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

		this.currentRoomRoles = undefined;

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
	 *
	 * @param roomId - The ID of the room
	 * @throws Error if members could not be deleted
	 */
	async deleteAllByRoomId(roomId: string): Promise<void> {
		await this.deleteMany({ roomId });
	}

	// ==========================================
	// PRIVATE HELPER METHODS
	// ==========================================

	/**
	 * Computes effective permissions by merging base role permissions with custom permissions.
	 *
	 * @param roomRoles - The room roles configuration
	 * @param baseRole - The base role of the member
	 * @param customPermissions - Optional custom permissions that override the base role
	 * @returns The effective permissions object
	 */
	private computeEffectivePermissions(
		roomRoles: MeetRoomRoles,
		baseRole: MeetRoomMemberRole,
		customPermissions?: Partial<MeetRoomMemberPermissions>
	): MeetRoomMemberPermissions {
		const basePermissions = roomRoles[baseRole].permissions;

		if (!customPermissions) {
			return basePermissions;
		}

		return {
			...basePermissions,
			...customPermissions
		};
	}
}
