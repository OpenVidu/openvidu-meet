import { FormControl, FormGroup } from '@angular/forms';
import {
	MeetRecordingAutoStartMode,
	MeetRecordingLayout,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomMemberPermissions
} from '@openvidu-meet/typings';
import { WizardStep, WizardStepId } from './wizard.model';

// Form value and group types for the room details step

export interface RoomDetailsFormValue {
	roomName: string | undefined;
	autoDeletionDate: Date | undefined;
	autoDeletionHour: number;
	autoDeletionMinute: number;
	autoDeletionPolicyWithMeeting: MeetRoomDeletionPolicyWithMeeting;
	autoDeletionPolicyWithRecordings: MeetRoomDeletionPolicyWithRecordings;
}

export type RoomDetailsFormGroup = FormGroup<{
	roomName: FormControl<string | undefined>;
	autoDeletionDate: FormControl<Date | undefined>;
	autoDeletionHour: FormControl<number>;
	autoDeletionMinute: FormControl<number>;
	autoDeletionPolicyWithMeeting: FormControl<MeetRoomDeletionPolicyWithMeeting>;
	autoDeletionPolicyWithRecordings: FormControl<MeetRoomDeletionPolicyWithRecordings>;
}>;

// Form value and group types for the meeting step

/**
 * Bounds the meeting-limit inputs validate against, mirroring the `MEETING_MIN`/`MEETING_MAX`
 * participant and duration limits of the backend's `INTERNAL_CONFIG`, which is the authority: this
 * is a pre-submit check so the wizard can explain the bound instead of showing a `422`.
 */
export const MIN_PARTICIPANTS_LIMIT = 1;
export const MAX_PARTICIPANTS_LIMIT = 30;
export const MIN_DURATION_MINUTES_LIMIT = 1;
export const MAX_DURATION_MINUTES_LIMIT = 1_440;

export interface MeetingConfigFormValue {
	chatEnabled: boolean;
	virtualBackgroundEnabled: boolean;
	e2eeEnabled: boolean;
	captionsEnabled: boolean;
	initialAudioActive: boolean;
	initialVideoActive: boolean;
	// `null` mirrors the stored "unlimited" value of the meeting limits (an empty input)
	maxParticipants: number | null;
	maxDurationMinutes: number | null;
}

export type MeetingConfigFormGroup = FormGroup<{
	chatEnabled: FormControl<boolean>;
	virtualBackgroundEnabled: FormControl<boolean>;
	e2eeEnabled: FormControl<boolean>;
	captionsEnabled: FormControl<boolean>;
	initialAudioActive: FormControl<boolean>;
	initialVideoActive: FormControl<boolean>;
	maxParticipants: FormControl<number | null>;
	maxDurationMinutes: FormControl<number | null>;
}>;

// Form value and group types for the room access step

export type RoomAccessPermissionsControls = {
	[K in keyof MeetRoomMemberPermissions]: FormControl<boolean>;
};

export type RoomAccessRolePermissionsFormGroup = FormGroup<RoomAccessPermissionsControls>;

export interface RoomAccessFormValue {
	anonymousModeratorEnabled: boolean;
	anonymousSpeakerEnabled: boolean;
	userEnabled: boolean;
	moderator: Partial<MeetRoomMemberPermissions>;
	speaker: Partial<MeetRoomMemberPermissions>;
}

export type RoomAccessFormGroup = FormGroup<{
	anonymousModeratorEnabled: FormControl<boolean>;
	anonymousSpeakerEnabled: FormControl<boolean>;
	userEnabled: FormControl<boolean>;
	moderator: RoomAccessRolePermissionsFormGroup;
	speaker: RoomAccessRolePermissionsFormGroup;
}>;

// Form value and group types for the recording step

/** When recording starts: by hand, or automatically at one of the `config.recording.autoStart` presets. */
export type RecordingTrigger = 'manual' | MeetRecordingAutoStartMode;

export interface RecordingFormValue {
	recordingEnabled: boolean;
	trigger: RecordingTrigger;
	layout: MeetRecordingLayout;
	anonymousRecordingEnabled: boolean;
}

export type RecordingFormGroup = FormGroup<{
	recordingEnabled: FormControl<boolean>;
	trigger: FormControl<RecordingTrigger>;
	layout: FormControl<MeetRecordingLayout>;
	anonymousRecordingEnabled: FormControl<boolean>;
}>;

/**
 * Mapping of wizard step identifiers to their corresponding form groups
 */
export type WizardStepFormGroupMap = {
	[WizardStepId.ROOM_DETAILS]: RoomDetailsFormGroup;
	[WizardStepId.MEETING]: MeetingConfigFormGroup;
	[WizardStepId.RECORDING]: RecordingFormGroup;
	[WizardStepId.ROOM_ACCESS]: RoomAccessFormGroup;
};

/**
 * Type representing any wizard step with its specific form group type
 */
export type AnyWizardStep = {
	[K in WizardStepId]: WizardStep<K, WizardStepFormGroupMap[K]>;
}[WizardStepId];
