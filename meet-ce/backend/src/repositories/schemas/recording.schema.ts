import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';

/**
 * Extended interface for Recording documents in MongoDB.
 * Includes the base MeetRecordingInfo plus internal access secrets.
 */
export interface MeetRecordingDocument extends MeetRecordingInfo, Document {
	accessSecrets?: {
		public: string;
		private: string;
	};
}

/**
 * Mongoose schema for Recording entity.
 * Defines the structure for recording documents in MongoDB.
 */
const MeetRecordingSchema = new Schema<MeetRecordingDocument>(
	{
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
		toObject: {
			versionKey: false,
			transform: (_doc, ret) => {
				// Remove MongoDB internal fields
				delete ret._id;
				// Remove access secrets before returning (they should only be accessed via specific methods)
				delete ret.accessSecrets;
				return ret;
			}
		}
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

/**
 * Mongoose model for Recording entity.
 */
export const MeetRecordingModel = model<MeetRecordingDocument>('MeetRecording', MeetRecordingSchema);
