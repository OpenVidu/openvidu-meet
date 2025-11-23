import { Document, model, Schema } from 'mongoose';
import { MeetMigration, MigrationName, MigrationStatus } from '../migration.model.js';

/**
 * Mongoose Document interface for MeetMigration.
 * Extends the MeetMigration interface with MongoDB Document functionality.
 */
export interface MeetMigrationDocument extends MeetMigration, Document {}

/**
 * Mongoose schema for the migrations collection.
 * Tracks which migrations have been executed and their status.
 */
const MigrationSchema = new Schema<MeetMigrationDocument>(
	{
		name: {
			type: String,
			required: true,
			enum: Object.values(MigrationName)
		},
		status: {
			type: String,
			required: true,
			enum: Object.values(MigrationStatus),
			default: MigrationStatus.RUNNING
		},
		startedAt: {
			type: Number,
			required: true,
			default: Date.now
		},
		completedAt: {
			type: Number,
			required: false
		},
		error: {
			type: String,
			required: false
		},
		metadata: {
			type: Schema.Types.Mixed,
			required: false
		}
	},
	{
		versionKey: false,
		toObject: {
			transform: (_doc, ret) => {
				delete ret._id;
				return ret;
			}
		}
	}
);

// Index for efficient lookups
MigrationSchema.index({ name: 1 }, { unique: true });
MigrationSchema.index({ status: 1 });

/**
 * Mongoose model for MeetMigration.
 */
export const MeetMigrationModel = model<MeetMigrationDocument>('MeetMigration', MigrationSchema);
