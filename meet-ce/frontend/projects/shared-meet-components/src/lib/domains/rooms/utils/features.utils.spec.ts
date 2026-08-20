import { MEET_PERMISSION_KEYS, MeetRoomConfig, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { InitialMediaRequest, RoomFeatures } from '../models/features.model';
import { FeatureCalculator } from './features.utils';

const buildPermissions = (overrides: Partial<MeetRoomMemberPermissions> = {}): MeetRoomMemberPermissions => {
	const permissions = {} as Record<string, boolean>;

	for (const key of MEET_PERMISSION_KEYS) {
		permissions[key] = true;
	}

	return { ...(permissions as unknown as MeetRoomMemberPermissions), ...overrides };
};

/**
 * Pins the permission → feature wiring of `FeatureCalculator.applyPermissions`, with special care for
 * the split recording keys: `showViewRecordings` follows `recordingList` alone and the in-meeting
 * recording controls follow `recordingControl` alone — a swap between the recording keys must fail
 * here, not in production.
 */
describe('FeatureCalculator.applyPermissions', () => {
	/** Only the fields `applyPermissions` reads or writes matter; room-config gates start open. */
	const buildFeatures = (): RoomFeatures =>
		({
			showStartStopRecording: true,
			showChat: true,
			showBackgrounds: true
		}) as RoomFeatures;

	const featuresFor = (overrides: Partial<MeetRoomMemberPermissions> = {}): RoomFeatures => {
		const features = buildFeatures();
		FeatureCalculator.applyPermissions(features, buildPermissions(overrides));

		return features;
	};

	// Each permission drives exactly these feature flags, and no other permission does.
	const DIRECT_MAPPINGS: [keyof MeetRoomMemberPermissions, (keyof RoomFeatures)[]][] = [
		['mediaPublishVideo', ['showCamera']],
		['mediaPublishAudio', ['showMicrophone']],
		['mediaShareScreen', ['showScreenShare']],
		['roomShareAccessLinks', ['showShareAccessLinks']],
		['participantPromote', ['showMakeModerator']],
		['meetingEnd', ['showEndMeeting']],
		['participantKick', ['showKickParticipants']],
		['recordingList', ['showViewRecordings']],
		['meetingJoin', ['showJoinMeeting']]
	];

	for (const [permissionKey, featureKeys] of DIRECT_MAPPINGS) {
		it(`should map '${permissionKey}' onto ${featureKeys.join(' + ')}`, () => {
			const granted = featuresFor();
			const denied = featuresFor({ [permissionKey]: false });

			for (const featureKey of featureKeys) {
				expect(granted[featureKey]).withContext(`${featureKey} when granted`).toBeTrue();
				expect(denied[featureKey]).withContext(`${featureKey} when denied`).toBeFalse();
			}
		});
	}

	it('should gate the recording controls on recordingControl alone', () => {
		expect(featuresFor({ recordingControl: false }).showStartStopRecording).toBeFalse();
		// The other recording keys don't hide the controls...
		expect(
			featuresFor({
				recordingList: false,
				recordingPlay: false,
				recordingDownload: false,
				recordingDelete: false
			}).showStartStopRecording
		).toBeTrue();
	});

	it('should keep showViewRecordings on recordingList even when play and download are denied', () => {
		const features = featuresFor({ recordingPlay: false, recordingDownload: false });

		expect(features.showViewRecordings).toBeTrue();
	});

	it('should not gate permissions whose room feature is already off', () => {
		const features = buildFeatures();
		features.showStartStopRecording = false;
		features.showChat = false;
		features.showBackgrounds = false;

		FeatureCalculator.applyPermissions(features, buildPermissions());

		expect(features.showStartStopRecording).toBeFalse();
		expect(features.showChat).toBeFalse();
		expect(features.showBackgrounds).toBeFalse();
	});

	it('should gate the chat panel on chatRead and the input on chatRead AND chatWrite', () => {
		const readOnly = featuresFor({ chatWrite: false });
		expect(readOnly.showChat).toBeTrue();
		expect(readOnly.showChatInput).toBeFalse();

		const noRead = featuresFor({ chatRead: false });
		expect(noRead.showChat).toBeFalse();
		expect(noRead.showChatInput).toBeFalse();
	});

	it('should gate the virtual backgrounds on mediaChangeVirtualBackground', () => {
		expect(featuresFor().showBackgrounds).toBeTrue();
		expect(featuresFor({ mediaChangeVirtualBackground: false }).showBackgrounds).toBeFalse();
	});
});

/**
 * Pins the precedence of `FeatureCalculator.resolveInitialMediaState`: permission above the embedding
 * application's request, request above the room-wide default, and `true` when nothing says anything.
 */
describe('FeatureCalculator.resolveInitialMediaState', () => {
	const stateFor = (
		request: InitialMediaRequest,
		roomConfig?: Partial<MeetRoomConfig>,
		permissions: Partial<MeetRoomMemberPermissions> = {}
	) =>
		FeatureCalculator.resolveInitialMediaState(
			request,
			buildPermissions(permissions),
			roomConfig as MeetRoomConfig | undefined
		);

	it('should open what the request asks for', () => {
		expect(stateFor({ audioEnabled: false, videoEnabled: false })).toEqual({ microphone: false, camera: false });
		expect(stateFor({ audioEnabled: true, videoEnabled: true })).toEqual({ microphone: true, camera: true });
	});

	it('should default to enabled when nothing is set anywhere', () => {
		expect(stateFor({})).toEqual({ microphone: true, camera: true });
	});

	it('should default to enabled while the permissions have not arrived yet', () => {
		expect(FeatureCalculator.resolveInitialMediaState({})).toEqual({ microphone: true, camera: true });
	});

	it('should never open a device its permission denies', () => {
		const state = stateFor({ audioEnabled: true, videoEnabled: true }, undefined, { mediaPublishVideo: false });

		expect(state).toEqual({ microphone: true, camera: false });
	});

	it('should apply the room-wide config.initial*Enabled when the request says nothing', () => {
		const state = stateFor({}, { initialAudioEnabled: false, initialVideoEnabled: false });

		expect(state).toEqual({ microphone: false, camera: false });
	});

	it('should treat an absent room-wide initial media config as enabled', () => {
		expect(stateFor({}, {})).toEqual({ microphone: true, camera: true });
	});

	// The precedence rule holds in both directions, so the next two tests are not the same test twice.
	it('should let an explicit request raise a room default of false', () => {
		const state = stateFor(
			{ audioEnabled: true, videoEnabled: true },
			{
				initialAudioEnabled: false,
				initialVideoEnabled: false
			}
		);

		expect(state).toEqual({ microphone: true, camera: true });
	});

	it('should let an explicit request lower a room default of true', () => {
		const state = stateFor(
			{ audioEnabled: false, videoEnabled: false },
			{
				initialAudioEnabled: true,
				initialVideoEnabled: true
			}
		);

		expect(state).toEqual({ microphone: false, camera: false });
	});

	it('should resolve each device independently', () => {
		// Audio: the request decides (on, over a room default of off).
		// Video: the request says nothing, so the room decides (off).
		const state = stateFor({ audioEnabled: true }, { initialAudioEnabled: false, initialVideoEnabled: false });

		expect(state).toEqual({ microphone: true, camera: false });
	});

	it('should keep a denying permission above an explicit request and the room config', () => {
		const state = stateFor({ audioEnabled: true }, { initialAudioEnabled: true }, { mediaPublishAudio: false });

		expect(state.microphone).toBeFalse();
	});
});
