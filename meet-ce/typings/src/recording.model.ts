import { SortAndPagination } from './sort-pagination.js';

/**
 * Recording status enumeration.
 */
export enum MeetRecordingStatus {
	STARTING = 'starting',
	ACTIVE = 'active',
	ENDING = 'ending',
	COMPLETE = 'complete',
	FAILED = 'failed',
	ABORTED = 'aborted',
	LIMIT_REACHED = 'limit_reached',
}

/**
 * Layout options for recordings.
 */
export enum MeetRecordingLayout {
	GRID = 'grid',
	SPEAKER = 'speaker',
	SINGLE_SPEAKER = 'single-speaker',
	// GRID_LIGHT = 'grid-light',
	// SPEAKER_LIGHT = 'speaker-light',
	// SINGLE_SPEAKER_LIGHT = 'single-speaker-light'
}

/**
 * Encoding presets for recordings.
 */
export enum MeetRecordingEncodingPreset {
	/**
	 * 1280x720, 30fps, 3000kbps. Recommended for most cases.
	 */
	H264_720P_30 = 'H264_720P_30',
	/**
	 * 1280x720, 60fps, ~4500 kbps. Smooth motion for fast action.
	 */
	H264_720P_60 = 'H264_720P_60',

	/**
	 * 1920x1080, 30fps, ~4500 kbps. High visual quality for detailed content.
	 */
	H264_1080P_30 = 'H264_1080P_30',

	/**
	 * 1920x1080, 60fps, ~6000 kbps. Premium quality with very smooth motion.
	 */
	H264_1080P_60 = 'H264_1080P_60',

	/**
	 * Portrait 720x1280, 30fps. Vertical video optimized for mobile/portrait use.
	 */
	PORTRAIT_H264_720P_30 = 'PORTRAIT_H264_720P_30',

	/**
	 * Portrait 720x1280, 60fps. Vertical video with smoother motion.
	 */
	PORTRAIT_H264_720P_60 = 'PORTRAIT_H264_720P_60',

	/**
	 * Portrait 1080x1920, 30fps. High-quality vertical recording.
	 */
	PORTRAIT_H264_1080P_30 = 'PORTRAIT_H264_1080P_30',

	/**
	 * Portrait 1080x1920, 60fps. Premium vertical recording with smooth motion.
	 */
	PORTRAIT_H264_1080P_60 = 'PORTRAIT_H264_1080P_60',
}

/**
 * Advanced encoding options for recordings.
 * Use presets for common scenarios; use this for fine-grained control.
 * Both video and audio configurations are required when using advanced options.
 */
export interface MeetRecordingEncodingOptions {
	/** Video encoding configuration */
	video: {
		/** Video width in pixels */
		width: number;
		/** Video height in pixels */
		height: number;
		/** Frame rate in fps */
		framerate: number;
		/** Video codec */
		codec: MeetRecordingVideoCodec;
		/** Video bitrate in kbps */
		bitrate: number;
		/** Keyframe interval in seconds */
		keyFrameInterval: number;
		/** Video depth (pixel format) in bits */
		depth: number;
	};

	/**
	 * Audio encoding configuration
	 */
	audio: {
		/** Audio codec */
		codec: MeetRecordingAudioCodec;
		/** Audio bitrate in kbps */
		bitrate: number;
		/** Audio sample rate in Hz */
		frequency: number;
	};
}

/**
 * Video encoding configuration
 */
export enum MeetRecordingVideoCodec {
	DEFAULT_VC = 'DEFAULT_VC',
	H264_BASELINE = 'H264_BASELINE',
	H264_MAIN = 'H264_MAIN',
	H264_HIGH = 'H264_HIGH',
	VP8 = 'VP8',
}

/**
 * Audio encoding configuration
 */
export enum MeetRecordingAudioCodec {
	DEFAULT_AC = 'DEFAULT_AC',
	OPUS = 'OPUS',
	AAC = 'AAC',
	AC_MP3 = 'AC_MP3',
}

// export enum MeetRecordingOutputMode {
// 	COMPOSED = 'composed',
// }

/**
 * Interface representing a recording
 */
export interface MeetRecordingInfo {
	recordingId: string;
	roomId: string;
	roomName: string;
	// outputMode: MeetRecordingOutputMode;
	status: MeetRecordingStatus;
	layout?: MeetRecordingLayout;
	encoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions;
	filename?: string;
	startDate?: number;
	endDate?: number;
	duration?: number;
	size?: number;
	errorCode?: number;
	error?: string;
	details?: string;
}

export interface MeetRecordingFilters extends SortAndPagination {
	roomId?: string;
	roomName?: string;
	status?: MeetRecordingStatus;
	fields?: string;
}
