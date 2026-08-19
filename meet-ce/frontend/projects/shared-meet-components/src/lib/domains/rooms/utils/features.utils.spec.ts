import { MEET_PERMISSION_KEYS, MeetRoomConfig, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { RoomFeatures } from '../models/features.model';
import { FeatureCalculator } from './features.utils';

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

	const buildPermissions = (overrides: Partial<MeetRoomMemberPermissions> = {}): MeetRoomMemberPermissions => {
		const permissions = {} as Record<string, boolean>;

		for (const key of MEET_PERMISSION_KEYS) {
			permissions[key] = true;
		}

		return { ...(permissions as unknown as MeetRoomMemberPermissions), ...overrides };
	};

	const featuresFor = (overrides: Partial<MeetRoomMemberPermissions> = {}): RoomFeatures => {
		const features = buildFeatures();
		FeatureCalculator.applyPermissions(features, buildPermissions(overrides));

		return features;
	};

	// Each permission drives exactly these feature flags, and no other permission does.
	const DIRECT_MAPPINGS: [keyof MeetRoomMemberPermissions, (keyof RoomFeatures)[]][] = [
		['mediaPublishVideo', ['videoEnabled', 'showCamera']],
		['mediaPublishAudio', ['audioEnabled', 'showMicrophone']],
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

	describe('applyInitialMediaEnabled', () => {
		it('should lower the initial media state without touching the controls', () => {
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, { audioEnabled: false, videoEnabled: false });

			expect(features.audioEnabled).toBeFalse();
			expect(features.videoEnabled).toBeFalse();
			// Initial state, not a capability: the participant may re-enable the devices
			expect(features.showMicrophone).toBeTrue();
			expect(features.showCamera).toBeTrue();
		});

		it('should leave an enabled attribute alone', () => {
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, { audioEnabled: true, videoEnabled: true });

			expect(features.audioEnabled).toBeTrue();
			expect(features.videoEnabled).toBeTrue();
		});

		it('should default to enabled when nothing is set anywhere', () => {
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, {});

			expect(features.audioEnabled).toBeTrue();
			expect(features.videoEnabled).toBeTrue();
		});

		it('should never raise a state a permission already denied', () => {
			const features = featuresFor({ mediaPublishVideo: false });
			FeatureCalculator.applyInitialMediaEnabled(features, { audioEnabled: true, videoEnabled: true });

			expect(features.videoEnabled).toBeFalse();
		});

		it('should apply the room-wide *OnJoin config when the attribute says nothing', () => {
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, {}, {
				audioEnabledOnJoin: false,
				videoEnabledOnJoin: false
			} as MeetRoomConfig);

			expect(features.audioEnabled).toBeFalse();
			expect(features.videoEnabled).toBeFalse();
			// Initial state, not a capability: the participant may re-enable the devices
			expect(features.showMicrophone).toBeTrue();
			expect(features.showCamera).toBeTrue();
		});

		it('should treat an absent *OnJoin config as enabled', () => {
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, {}, {} as MeetRoomConfig);

			expect(features.audioEnabled).toBeTrue();
			expect(features.videoEnabled).toBeTrue();
		});

		// The precedence rule, in both directions: an attribute that is set decides, so it can raise a
		// room default of `false` as well as lower one of `true`. The room field is a default, not a
		// policy — enforcing a device off is the permission's job.
		it('should let an explicit attribute raise a room default of false', () => {
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, { audioEnabled: true, videoEnabled: true }, {
				audioEnabledOnJoin: false,
				videoEnabledOnJoin: false
			} as MeetRoomConfig);

			expect(features.audioEnabled).toBeTrue();
			expect(features.videoEnabled).toBeTrue();
		});

		it('should let an explicit attribute lower a room default of true', () => {
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, { audioEnabled: false, videoEnabled: false }, {
				audioEnabledOnJoin: true,
				videoEnabledOnJoin: true
			} as MeetRoomConfig);

			expect(features.audioEnabled).toBeFalse();
			expect(features.videoEnabled).toBeFalse();
		});

		it('should resolve each device independently', () => {
			// Audio: the attribute decides (on, over a room default of off).
			// Video: the attribute says nothing, so the room decides (off).
			const features = featuresFor();
			FeatureCalculator.applyInitialMediaEnabled(features, { audioEnabled: true }, {
				audioEnabledOnJoin: false,
				videoEnabledOnJoin: false
			} as MeetRoomConfig);

			expect(features.audioEnabled).toBeTrue();
			expect(features.videoEnabled).toBeFalse();
		});

		it('should keep a denying permission above an explicit attribute and the room config', () => {
			const features = featuresFor({ mediaPublishAudio: false });
			FeatureCalculator.applyInitialMediaEnabled(features, { audioEnabled: true }, {
				audioEnabledOnJoin: true
			} as MeetRoomConfig);

			expect(features.audioEnabled).toBeFalse();
		});
	});
});
