/**
 * Options for joining a browser-based fake participant
 */
export interface BrowserFakeParticipantOptions {
	/** Path to audio file (relative to assets/audio or absolute) - WAV format recommended */
	audioFile?: string;
	/** Path to video file (relative to assets/video or absolute) - Y4M or MJPEG format recommended for Chrome */
	videoFile?: string;
	/** Participant display name */
	displayName?: string;
	/** Whether to enable video (default: true) */
	enableVideo?: boolean;
	/** Whether to enable audio (default: true) */
	enableAudio?: boolean;
	/** Whether to enable screen sharing (default: false) */
	screenShare?: boolean;
}
