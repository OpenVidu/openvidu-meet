import type { BulkRecording, BulkRecordingFailure } from '../services/recording.service.js';

declare global {
	namespace Express {
		interface Locals {
			validatedQuery?: Record<string, unknown>;
			bulkValidation?: {
				processableIds: string[];
				failed: unknown[];
			};
			bulkRecordings?: {
				accessible: BulkRecording[];
				failed: BulkRecordingFailure[];
			};
		}
	}
}

export {};
