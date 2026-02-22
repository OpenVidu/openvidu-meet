import { MeetRecordingInfo, MeetRecordingLayout, MeetRecordingStatus } from '@openvidu-meet/typings';
import { model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { SchemaMigratableDocument } from '../migration.model.js';

/**
 * Mongoose Document interface for Recordings.
 * Extends the MeetRecordingInfo interface with schemaVersion for migration tracking
 * and internal access secrets.
 */
export interface MeetRecordingDocument extends MeetRecordingInfo, SchemaMigratableDocument {
	accessSecrets: {
		public: string;
		private: string;
	};
}

/**
 * Mongoose schema for MeetRecordingInfo entity.
 * Defines the structure and validation rules for recording documents in MongoDB.
 */
const MeetRecordingSchema = new Schema<MeetRecordingDocument>(
	{
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.RECORDING_SCHEMA_VERSION
		},
		recordingId: {
			type: String,
			required: true
		},
		roomId: {
			type: String,
			required: true
		},
		roomName: {
			type: String,
			required: true
		},
		status: {
			type: String,
			enum: Object.values(MeetRecordingStatus),
			required: true
		},
		layout: {
			type: String,
			enum: Object.values(MeetRecordingLayout),
			required: true
		},
		encoding: {
			type: Schema.Types.Mixed,
			required: true
		},
		filename: {
			type: String,
			required: false
		},
		startDate: {
			type: Number,
			required: false
		},
		endDate: {
			type: Number,
			required: false
		},
		duration: {
			type: Number,
			required: false
		},
		size: {
			type: Number,
			required: false
		},
		errorCode: {
			type: Number,
			required: false
		},
		error: {
			type: String,
			required: false
		},
		details: {
			type: String,
			required: false
		},
		accessSecrets: {
			public: {
				type: String,
				required: true
			},
			private: {
				type: String,
				required: true
			}
		}
	},
	{
		versionKey: false
	}
);

// Create indexes for efficient querying
MeetRecordingSchema.index({ recordingId: 1 }, { unique: true });
MeetRecordingSchema.index({ startDate: -1, _id: -1 });
MeetRecordingSchema.index({ roomId: 1, startDate: -1, _id: -1 });
MeetRecordingSchema.index({ roomName: 1, startDate: -1, _id: -1 });
MeetRecordingSchema.index({ status: 1, startDate: -1, _id: -1 });
MeetRecordingSchema.index({ duration: -1, _id: -1 });
MeetRecordingSchema.index({ size: -1, _id: -1 });

export const meetRecordingCollectionName = 'MeetRecording';

/**
 * Mongoose model for MeetRecordingInfo entity.
 */
export const MeetRecordingModel = model<MeetRecordingDocument>(meetRecordingCollectionName, MeetRecordingSchema);
