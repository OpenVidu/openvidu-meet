import { MeetRoomMember, MeetRoomMemberRole } from '@openvidu-meet/typings';
import { Document, Schema, model } from 'mongoose';

/**
 * Mongoose Document interface for MeetRoomMember.
 * Extends the MeetRoomMember interface with MongoDB Document functionality.
 * Note: effectivePermissions is computed, not stored.
 */
export interface MeetRoomMemberDocument extends Omit<MeetRoomMember, 'effectivePermissions'>, Document {
	/** Schema version for migration tracking (internal use only) */
	schemaVersion?: number;
}

const permissionFields = {
	canRecord: { type: Boolean },
	canRetrieveRecordings: { type: Boolean },
	canDeleteRecordings: { type: Boolean },
	canJoinMeeting: { type: Boolean },
	canShareAccessLinks: { type: Boolean },
	canMakeModerator: { type: Boolean },
	canKickParticipants: { type: Boolean },
	canEndMeeting: { type: Boolean },
	canPublishVideo: { type: Boolean },
	canPublishAudio: { type: Boolean },
	canShareScreen: { type: Boolean },
	canReadChat: { type: Boolean },
	canWriteChat: { type: Boolean },
	canChangeVirtualBackground: { type: Boolean }
};

function createPermissionsSchema(required: boolean) {
	const schemaDefinition: Record<string, unknown> = {};

	for (const key of Object.keys(permissionFields)) {
		schemaDefinition[key] = { ...permissionFields[key as keyof typeof permissionFields], required };
	}

	return new Schema(schemaDefinition, { _id: false });
}

/**
 * Sub-schema for room member permissions.
 */
export const MeetRoomMemberPermissionsSchema = createPermissionsSchema(true);

/**
 * Sub-schema for partial room member permissions.
 */
const MeetRoomMemberPartialPermissionsSchema = createPermissionsSchema(false);

/**
 * Mongoose schema for MeetRoomMember entity.
 */
const MeetRoomMemberSchema = new Schema<MeetRoomMemberDocument>(
	{
		memberId: {
			type: String,
			required: true
		},
		roomId: {
			type: String,
			required: true
		},
		name: {
			type: String,
			required: true
		},
		baseRole: {
			type: String,
			enum: Object.values(MeetRoomMemberRole),
			required: true
		},
		customPermissions: {
			type: MeetRoomMemberPartialPermissionsSchema,
			required: false
		}
	},
	{
		toObject: {
			versionKey: false,
			transform: (_doc, ret) => {
				delete ret._id;
				delete ret.schemaVersion;
				return ret;
			}
		}
	}
);

// Create indexes for efficient querying
MeetRoomMemberSchema.index({ roomId: 1, memberId: 1 }, { unique: true });
MeetRoomMemberSchema.index({ roomId: 1, name: 1, _id: 1 });
MeetRoomMemberSchema.index({ memberId: 1 });

export const meetRoomMemberCollectionName = 'MeetRoomMember';

/**
 * Mongoose model for MeetRoomMember.
 */
export const MeetRoomMemberModel = model<MeetRoomMemberDocument>(meetRoomMemberCollectionName, MeetRoomMemberSchema);
