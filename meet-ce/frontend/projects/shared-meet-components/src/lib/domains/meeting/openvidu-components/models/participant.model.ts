import { computed, signal } from '@angular/core';
import { MeetRoomMemberTokenMetadata, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { LocalAudioTrack, LocalVideoTrack, RemoteParticipant, Room, TrackPublication } from '../services/livekit';
import {
	AudioCaptureOptions,
	ConnectionQuality,
	DataPublishOptions,
	LocalParticipant,
	LocalTrack,
	LocalTrackPublication,
	ScreenShareCaptureOptions,
	Track,
	TrackPublishOptions,
	VideoCaptureOptions
} from '../services/livekit';
import { DeviceType } from './device.model';
import { ScreenZoomState } from './screen-zoom.model';

export interface ParticipantLeftEvent {
	roomName: string;
	participantName: string;
	identity: string;
	reason: ParticipantLeftReason;
}

export enum ParticipantLeftReason {
	// User-initiated disconnections
	LEAVE = 'LEAVE', // The participant left the room voluntarily
	BROWSER_UNLOAD = 'browser_unload', // The participant was disconnected due to a browser unload event

	// Network-related disconnections
	NETWORK_DISCONNECT = 'network_disconnect', // The participant was disconnected due to a network error
	SIGNAL_CLOSE = 'websocket_closed', // The participant was disconnected due to a websocket error

	// Server-initiated disconnections
	SERVER_SHUTDOWN = 'server_shutdown', // The server was shut down
	PARTICIPANT_REMOVED = 'participant_removed', // The participant was removed from the room
	ROOM_DELETED = 'room_deleted', // The room was deleted

	// Permission/policy-based disconnections
	DUPLICATE_IDENTITY = 'duplicate_identity', // The participant was disconnected due to a duplicate identity

	OTHER = 'other' // The participant was disconnected for an unknown reason
}

/**
 * Read side of the per-viewer stream view state (pin, float, forcible mute). Implemented by
 * `StreamLayoutStateService`, which owns that state; declared here so the model does not depend on
 * the service layer. Pin/float are keyed by {@link ParticipantStream.streamId}; forcible mutes are
 * keyed by participant SID.
 */
export interface ParticipantViewStateReader {
	isStreamPinned(streamId: string): boolean;
	isStreamFloating(streamId: string): boolean;
	isCameraStreamMuted(participantSid: string): boolean;
	isScreenStreamMuted(participantSid: string): boolean;
}

/**
 * Interface that represents a combined audio+video stream for a single visual element.
 * A camera stream groups the camera video track and the microphone audio track.
 * A screen-share stream groups the screen-share video track and the screen-share audio track.
 */
export interface ParticipantStream {
	/** The participant who owns this stream. */
	participant: ParticipantModel;
	/** Primary source of this stream (Camera or ScreenShare). */
	source: Track.Source;
	/** Video track publication, undefined when no video is published (avatar will be shown). */
	videoTrack: TrackPublication | undefined;
	/** Associated audio track publication, undefined when no audio is published. */
	audioTrack: TrackPublication | undefined;
	/** True when this is the camera/mic stream. */
	isCameraStream: boolean;
	/** True when this is the screen-share stream. */
	isScreenStream: boolean;
	/** Stable identifier used for @for trackBy — videoTrack SID or a synthetic fallback. */
	streamId: string;
	/** Whether this stream is pinned (enlarged) for this viewer. */
	isPinned: boolean;
	/** Whether this stream floats as picture-in-picture for this viewer. */
	isFloating: boolean;
	/** Whether this stream is forcibly muted for this viewer. */
	isMutedForcibly: boolean;
	/**
	 * Per-viewer zoom/pan state for screen-share streams. Only present on screen streams;
	 * the same instance is reused across stream recomputations so the zoom persists for the
	 * lifetime of the underlying screen track.
	 */
	zoom?: ScreenZoomState;
}

/**
 * Interface defining properties of a participant.
 */
export interface ParticipantProperties {
	/**
	 * The participant instance, which can be either a local participant or a remote participant.
	 */
	participant: LocalParticipant | RemoteParticipant;

	/**
	 * The room in which the participant is located, applicable only for local participants.
	 */
	room?: Room;

	/**
	 * The color profile associated with the participant.
	 * It specifies the visual representation of the participant in the user interface.
	 */
	colorProfile?: string;

	/**
	 * Per-viewer view state (pin/float/forcible mute) read by {@link ParticipantModel.streams}.
	 * Provided by `ParticipantService` when it creates the model. When absent, every stream
	 * reports unpinned/undocked/unmuted.
	 * @internal
	 **/
	viewState?: ParticipantViewStateReader;
}

/**
 * Interface for computed participant display properties
 */
export interface ParticipantDisplayProperties {
	showBadge: boolean;
	showModerationControls: boolean;
	showMakeModeratorButton: boolean;
	showUnmakeModeratorButton: boolean;
	showKickButton: boolean;
}

/**
 * Class that represents a participant in the room.
 */
export class ParticipantModel {
	// ── Public state ────────────────────────────────────────────────────────────────────────────────
	/**
	 * The color profile associated with the participant.
	 * It specifies the visual representation of the participant in the user interface.
	 */
	colorProfile: string;

	// ── Private state ─────────────────────────────────────────────────────────────────────────────
	private participant: LocalParticipant | RemoteParticipant;
	private room: Room | undefined;
	private viewState: ParticipantViewStateReader | undefined;

	// Reactive state. These signals replace plain boolean fields. Getters that read them are
	// automatically tracked by Angular templates and effects, eliminating the need to clone
	// ParticipantModel or spread the participants array in ParticipantService every time state changes.
	private readonly _speaking = signal(false);
	private readonly _hasEncryptionError = signal(false);
	private readonly _decryptedName = signal<string | undefined>(undefined);
	private readonly _connectionQuality = signal<ConnectionQuality>(ConnectionQuality.Unknown);
	/**
	 * Revision counter — bumped via bump() whenever the underlying LiveKit participant object is
	 * mutated in-place (track published/unpublished, isCameraEnabled changes, name changes, etc.).
	 * Reading _revision() inside publications propagates the dependency to every getter and
	 * computed that calls it — so streams, isCameraEnabled, etc. all react automatically.
	 * This is its ONLY meaning: per-viewer view state (pin/float/mute) lives in
	 * `StreamLayoutStateService` signals and needs no bump.
	 */
	private readonly _revision = signal(0);
	// Meet moderation / badge state.
	private readonly _badge = signal(MeetRoomMemberUIBadge.OTHER);
	private readonly _isPromotedModerator = signal(false);
	/**
	 * Per-viewer screen-share zoom state, keyed by screen stream id. Kept outside the stream
	 * snapshots (which are rebuilt on every revision) so a participant's zoom survives unrelated
	 * track/state changes and only resets when the screen track itself changes.
	 */
	private readonly screenZoomStates = new Map<string, ScreenZoomState>();

	// ── Public reactive properties ──────────────────────────────────────────────────────────────────
	/**
	 * Returns the participant streams grouped by source (camera and screen share).
	 * Each stream bundles a video track and its paired audio track so they can be
	 * rendered into a single <video> element, eliminating the separate <audio> element
	 * and the audio/video de-sync risk that came with it.
	 *
	 * A camera stream is **always** produced (even when there is no camera track) so
	 * that the participant avatar is always visible.
	 *
	 * Reactive: declared as an Angular `computed` signal. LayoutComponent's template reads
	 * `participant.streams()` — Angular tracks `_revision` (via publications) plus the
	 * view-state signals behind {@link ParticipantViewStateReader}, and only re-evaluates when
	 * track structure or per-viewer view state actually changes. State-only changes (speaking,
	 * encryptionError) are tracked independently per StreamComponent via the signal-backed
	 * getters (isSpeaking, hasEncryptionError, etc.).
	 */
	readonly streams = computed(() => {
		const allTracks = this.publications();

		const cameraVideoTrack = allTracks.find(
			(t) => t.source === Track.Source.Camera && t.kind === Track.Kind.Video
		);
		const micAudioTrack = allTracks.find((t) => t.source === Track.Source.Microphone);
		const screenVideoTrack = allTracks.find(
			(t) => t.source === Track.Source.ScreenShare && t.kind === Track.Kind.Video
		);
		const screenAudioTrack = allTracks.find((t) => t.source === Track.Source.ScreenShareAudio);

		const result: ParticipantStream[] = [];

		// Camera stream — always present so the participant is always visible in the grid.
		// When there is no real camera track, the MediaElement renders the avatar instead.
		const cameraStreamId = cameraVideoTrack?.trackSid ?? `camera-${this.identity}`;
		result.push({
			participant: this,
			source: Track.Source.Camera,
			videoTrack: cameraVideoTrack,
			audioTrack: micAudioTrack,
			isCameraStream: true,
			isScreenStream: false,
			streamId: cameraStreamId,
			isPinned: this.viewState?.isStreamPinned(cameraStreamId) ?? false,
			isFloating: this.viewState?.isStreamFloating(cameraStreamId) ?? false,
			isMutedForcibly: this.viewState?.isCameraStreamMuted(this.sid) ?? false
		});

		// Screen share stream — only when screen sharing is active
		if (screenVideoTrack || screenAudioTrack) {
			const screenStreamId = screenVideoTrack?.trackSid ?? `screen-${this.identity}`;
			result.push({
				participant: this,
				source: Track.Source.ScreenShare,
				videoTrack: screenVideoTrack,
				audioTrack: screenAudioTrack,
				isCameraStream: false,
				isScreenStream: true,
				streamId: screenStreamId,
				isPinned: this.viewState?.isStreamPinned(screenStreamId) ?? false,
				isFloating: false,
				isMutedForcibly: this.viewState?.isScreenStreamMuted(this.sid) ?? false,
				zoom: this.resolveScreenZoom(screenStreamId)
			});
		}

		return result;
	});

	constructor(props: ParticipantProperties) {
		this.participant = props.participant;
		this.colorProfile = props.colorProfile ?? `hsl(${Math.random() * 360}, 100%, 80%)`;
		this.room = props.room;
		this.viewState = props.viewState;

		this.updateModerationMetadata(props.participant.metadata);
	}

	// ── Public getters ────────────────────────────────────────────────────────────────────────────
	/**
	 * @internal
	 */
	get identity() {
		return this.participant.identity;
	}

	/**
	 * Returns the server assigned unique identifier for the participant.
	 * @returns string
	 */
	get sid(): string {
		return this.participant.sid;
	}

	/**
	 * Returns the participant name.
	 * @returns string
	 */
	get name(): string | undefined {
		this._revision(); // reactive: the name can be renamed server-side (ParticipantNameChanged)
		return this._decryptedName() ?? this.participant.name;
	}

	/**
	 * Returns the room name where the participant is.
	 * @return string | undefined
	 * @internal
	 */
	get roomName(): string | undefined {
		return this.room?.name;
	}

	/**
	 * Returns if the participant has enabled its camera.
	 */
	get isCameraEnabled(): boolean {
		this._revision(); // reactive: re-evaluates in effects/computed when bump() is called
		return this.participant.isCameraEnabled;
	}

	/**
	 * Returns if the participant has enabled its microphone.
	 */
	get isMicrophoneEnabled(): boolean {
		this._revision();
		return this.participant.isMicrophoneEnabled;
	}

	/**
	 * Returns if the participant has enabled its screen share.
	 */
	get isScreenShareEnabled(): boolean {
		this._revision();
		return this.participant.isScreenShareEnabled;
	}

	/**
	 * Returns the participant's published microphone audio track, if any. Used to feed the
	 * local microphone activity analyser behind the mic status warnings.
	 * @internal
	 */
	getMicrophoneTrack(): LocalAudioTrack | undefined {
		this._revision(); // reactive: re-evaluates when bump() fires (publish/unpublish, device switch)
		const publication = this.participant
			.getTrackPublications()
			.find((pub) => pub.source === Track.Source.Microphone && pub.kind === Track.Kind.Audio);
		return publication?.track as LocalAudioTrack | undefined;
	}

	/**
	 * Returns the participant's published camera video track, if any. Reactive companion to
	 * {@link getMicrophoneTrack} so consumers can track the live local camera track.
	 * @internal
	 */
	getCameraTrack(): LocalVideoTrack | undefined {
		this._revision(); // reactive: re-evaluates when bump() fires (publish/unpublish, device switch)
		const publication = this.participant
			.getTrackPublications()
			.find((pub) => pub.source === Track.Source.Camera && pub.kind === Track.Kind.Video);
		return publication?.track as LocalVideoTrack | undefined;
	}

	/**
	 * Returns if the participant is speaking.
	 */
	get isSpeaking(): boolean {
		// There is a bug when a participant mutes its microphone, it is still considered as speaking
		// that's why we need to check if the microphone is enabled
		return this._speaking() && this.isMicrophoneEnabled;
	}

	/**
	 * Returns all the participant track publications, straight from LiveKit.
	 * @internal
	 */
	get tracks(): TrackPublication[] {
		return this.publications();
	}

	/**
	 * Returns if the participant is local.
	 */
	get isLocal(): boolean {
		return this.participant.isLocal;
	}

	/**
	 * Returns if the participant has any stream forcibly muted for this viewer.
	 * @internal
	 */
	get isMutedForcibly(): boolean {
		return this.streams().some((stream) => stream.isMutedForcibly);
	}

	/**
	 * Returns if the participant has any stream floating.
	 * @internal
	 */
	get isFloating(): boolean {
		return this.streams().some((stream) => stream.isFloating);
	}

	/**
	 * Gets whether this participant is pinned.
	 * This indicates that the participant's video is fixed in place in the UI.
	 * @returns boolean
	 */
	get isPinned(): boolean {
		return this.streams().some((stream) => stream.isPinned);
	}

	/**
	 * Gets whether this participant has an encryption error.
	 * This indicates that the participant cannot decrypt the video stream due to an incorrect encryption key.
	 * @returns boolean
	 */
	get hasEncryptionError(): boolean {
		return this._hasEncryptionError();
	}

	/**
	 * Returns the connection quality of this participant.
	 */
	get connectionQuality(): ConnectionQuality {
		return this._connectionQuality();
	}

	// ── Public setters ────────────────────────────────────────────────────────────────────────────
	set badge(badge: MeetRoomMemberUIBadge) {
		this._badge.set(badge);
	}

	set promotedModerator(isPromoted: boolean) {
		this._isPromotedModerator.set(isPromoted);
	}

	// ── Public methods ────────────────────────────────────────────────────────────────────────────
	/**
	 *
	 * Creates a screen capture tracks with getDisplayMedia(). A LocalVideoTrack is always created and returned.
	 * @param options
	 * @returns Promise<LocalTrack[]>
	 * @internal
	 */
	createScreenTracks(options: ScreenShareCaptureOptions): Promise<LocalTrack[]> {
		if (this.participant instanceof LocalParticipant) {
			return this.participant.createScreenTracks(options);
		}

		return Promise.reject("Remote participant can't create screen tracks");
	}

	/**
	 *
	 * Publishes a track to the room
	 * @param track
	 * @returns
	 */
	publishTrack(track: LocalTrack, options?: TrackPublishOptions): Promise<LocalTrackPublication> {
		if (this.participant instanceof LocalParticipant) {
			return this.participant.publishTrack(track, options);
		}

		return Promise.reject("Remote participant can't publish tracks");
	}

	/**
	 * Enable or disable a participant's camera track.
	 * @param enabled
	 * @returns Promise<LocalTrackPublication | undefined>
	 * @internal
	 */
	setCameraEnabled(
		enabled: boolean,
		options?: VideoCaptureOptions,
		publishOptions?: TrackPublishOptions
	): Promise<LocalTrackPublication | undefined> {
		if (this.participant instanceof LocalParticipant) {
			return this.participant.setCameraEnabled(enabled, options, publishOptions);
		}

		return Promise.reject("Remote participant can't enable camera");
	}

	/**
	 * Enable or disable a participant's microphone track.
	 * @param enabled
	 * @returns Promise<LocalTrackPublication | undefined>
	 * @internal
	 */
	setMicrophoneEnabled(
		enabled: boolean,
		options?: AudioCaptureOptions,
		publishOptions?: TrackPublishOptions
	): Promise<LocalTrackPublication | undefined> {
		if (this.participant instanceof LocalParticipant) {
			return this.participant.setMicrophoneEnabled(enabled, options, publishOptions);
		}

		return Promise.reject("Remote participant can't enable microphone");
	}

	/**
	 * Start or stop sharing a participant's screen
	 * @param enabled
	 * @returns Promise<LocalTrackPublication | undefined>
	 * @internal
	 */
	setScreenShareEnabled(
		enabled: boolean,
		options: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions
	): Promise<LocalTrackPublication | undefined> {
		if (this.participant instanceof LocalParticipant) {
			return this.participant.setScreenShareEnabled(enabled, options, publishOptions);
		}

		return Promise.reject("Remote participant can't enable screen share");
	}

	/**
	 * Sets the participant's speaking status.
	 * @param speaking
	 * @internal
	 */
	setSpeaking(speaking: boolean) {
		this._speaking.set(speaking);
	}

	/**
	 * Switches the active camera track used in this room to the given device id.
	 * @param deviceId
	 * @returns Promise<void>
	 * @internal
	 */
	async switchCamera(deviceId: string): Promise<void> {
		if (this.room) {
			await this.room.switchActiveDevice(DeviceType.VIDEO_INPUT, deviceId);
		}
	}

	/**
	 * Switches the active microphone track used in this room to the given device id.
	 * @param deviceId
	 * @returns Promise<void>
	 * @internal
	 */
	async switchMicrophone(deviceId: string): Promise<void> {
		if (this.room) {
			await this.room.switchActiveDevice(DeviceType.AUDIO_INPUT, deviceId);
		}
	}

	/**
	 * Switches the active screen share track showing a native browser dialog to select a screen or window.
	 * No bump() is needed: replaceTrack keeps the same publication and SID, and livekit-client
	 * re-attaches the new MediaStreamTrack to the already-attached elements.
	 * @param newTrack [LocalTrack](https://docs.livekit.io/client-sdk-js/classes/LocalTrack.html)
	 * @returns Promise<void>
	 * @internal
	 */
	async switchScreenshare(newTrack: LocalTrack): Promise<void> {
		if (!(this.participant instanceof LocalParticipant)) {
			return Promise.reject("Remote participant can't switch screen share");
		}

		const screenTrack = this.publications().find((track) => track.source === Track.Source.ScreenShare);

		if (!screenTrack || !screenTrack.videoTrack) {
			return Promise.reject('No active screen share track to switch');
		}

		const currentTrack = screenTrack.videoTrack as LocalTrack;

		await currentTrack.replaceTrack(newTrack.mediaStreamTrack);
		return Promise.resolve();
	}

	/**
	 * Publish a new data payload to the room. Data will be forwarded to each participant in the room if the destination field in publishOptions is empty.
	 * @param data
	 * @param {DataPublishOptions} publishOptions [DataPublishOptions](https://docs.livekit.io/client-sdk-js/types/DataPublishOptions.html)
	 * @returns Promise that is resolved if the data was successfully sent, or rejected with an Error object if not.
	 * @internal
	 */
	async publishData(data: Uint8Array<ArrayBuffer>, publishOptions: DataPublishOptions): Promise<void> {
		if (this.participant instanceof LocalParticipant) {
			return this.participant.publishData(data, publishOptions);
		}

		return Promise.reject("Remote participant can't publish data");
	}

	// NOTE: a `setName` method is intentionally NOT implemented — updating a participant's name
	// requires `canUpdateOwnMetadata=true` server-side, which is insecure, so the feature is omitted.

	/**
	 * Sets the encryption error state for this participant.
	 * @param hasError - Whether the participant has an encryption error
	 * @internal
	 */
	setEncryptionError(hasError: boolean) {
		this._hasEncryptionError.set(hasError);
	}

	/**
	 * Sets the connection quality for this participant.
	 * @param quality
	 * @internal
	 */
	setConnectionQuality(quality: ConnectionQuality) {
		this._connectionQuality.set(quality);
	}

	/**
	 * Sets the decrypted name for this participant.
	 * @param decryptedName - The decrypted participant name
	 * @internal
	 */
	setDecryptedName(decryptedName: string | undefined) {
		this._decryptedName.set(decryptedName);
	}

	/**
	 * Bumps the internal revision signal, causing `streams` and all reactive getters
	 * (isCameraEnabled, name, etc.) to re-evaluate in templates and effects.
	 * Only the event/media layer (ParticipantService, LocalMediaControlService) should call this,
	 * and only after an operation that mutates the underlying LiveKit participant in-place
	 * (e.g. after setCameraEnabled, setMicrophoneEnabled, publishTrack, a room event).
	 * @internal
	 */
	bump(): void {
		this._revision.update((v) => v + 1);
	}

	/**
	 * Gets the participant's badge.
	 * @returns The MeetRoomMemberUIBadge representing the participant's badge.
	 */
	getBadge(): MeetRoomMemberUIBadge {
		return this._badge();
	}

	/**
	 * Checks if the participant has a badge other than OTHER.
	 * @returns True if the participant has a badge, false otherwise.
	 */
	hasBadge(): boolean {
		return this._badge() !== MeetRoomMemberUIBadge.OTHER;
	}

	/**
	 * Checks if the participant is a promoted moderator (not an original moderator).
	 * @returns True if the participant is a promoted moderator, false otherwise.
	 */
	isPromotedModerator(): boolean {
		return this._isPromotedModerator();
	}

	// ── Private methods ───────────────────────────────────────────────────────────────────────────
	/**
	 * Returns the participant's LiveKit track publications, cached per revision. Reading
	 * _revision() registers it as a reactive dependency — consumers re-evaluate when bump() is
	 * called after a LiveKit mutation.
	 */
	private readonly publications = computed<TrackPublication[]>(() => {
		this._revision();
		return this.participant.getTrackPublications();
	});

	/**
	 * Returns the persistent {@link ScreenZoomState} for the given screen stream, creating it on
	 * first use and discarding state for any screen track that is no longer present. This keeps the
	 * zoom stable across stream recomputations while resetting it when a new screen share starts.
	 */
	private resolveScreenZoom(streamId: string): ScreenZoomState {
		for (const key of this.screenZoomStates.keys()) {
			if (key !== streamId) {
				this.screenZoomStates.delete(key);
			}
		}

		let state = this.screenZoomStates.get(streamId);

		if (!state) {
			state = new ScreenZoomState();
			this.screenZoomStates.set(streamId, state);
		}

		return state;
	}

	/**
	 * Parses the LiveKit participant metadata and syncs the badge / promoted-moderator signals.
	 */
	private updateModerationMetadata(metadata: unknown): void {
		const parsedMetadata = parseParticipantMetadata(metadata);
		this._badge.set(parsedMetadata?.badge || MeetRoomMemberUIBadge.OTHER);
		this._isPromotedModerator.set(Boolean(parsedMetadata?.isPromotedModerator));
	}
}

/**
 * Parses the LiveKit connection metadata into a {@link MeetRoomMemberTokenMetadata}, returning
 * `undefined` for anything that is not a valid payload (missing, malformed JSON, no badge, or a
 * non-boolean promoted-moderator flag). Single parser shared by the model constructor and the
 * `ParticipantMetadataChanged` handler so both paths validate identically.
 */
export const parseParticipantMetadata = (metadata: unknown): MeetRoomMemberTokenMetadata | undefined => {
	if (!metadata || typeof metadata !== 'string') {
		return undefined;
	}

	let parsed: Partial<MeetRoomMemberTokenMetadata>;

	try {
		parsed = JSON.parse(metadata) as Partial<MeetRoomMemberTokenMetadata>;
	} catch (error) {
		console.warn('Failed to parse participant metadata:', error);
		return undefined;
	}

	if (!parsed || typeof parsed !== 'object' || !parsed.badge) {
		return undefined;
	}

	if (parsed.isPromotedModerator !== undefined && typeof parsed.isPromotedModerator !== 'boolean') {
		return undefined;
	}

	return parsed as MeetRoomMemberTokenMetadata;
};
