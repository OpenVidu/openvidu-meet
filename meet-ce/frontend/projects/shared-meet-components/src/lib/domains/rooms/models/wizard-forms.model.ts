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

// Form value and group types for the room config step

export interface RoomConfigFormValue {
	chatEnabled: boolean;
	virtualBackgroundEnabled: boolean;
	e2eeEnabled: boolean;
	captionsEnabled: boolean;
	// `null` mirrors the stored "unlimited" value of the meeting limits (an empty input)
	maxParticipants: number | null;
	maxDurationMinutes: number | null;
}

export type RoomConfigFormGroup = FormGroup<{
	chatEnabled: FormControl<boolean>;
	virtualBackgroundEnabled: FormControl<boolean>;
	e2eeEnabled: FormControl<boolean>;
	captionsEnabled: FormControl<boolean>;
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

// Form value and group types for the recording config step

export type RecordingEnabledOption = 'enabled' | 'disabled';

export interface RecordingFormValue {
	recordingEnabled: RecordingEnabledOption;
	anonymousRecordingEnabled: boolean;
}

export type RecordingFormGroup = FormGroup<{
	recordingEnabled: FormControl<RecordingEnabledOption>;
	anonymousRecordingEnabled: FormControl<boolean>;
}>;

// Form value and group types for the recording trigger step
//
// The trigger is a two-level decision: the top-level card picks manual vs. automatic, and only
// when automatic is chosen does a second, secondary choice appear for the participant threshold.
// `autoStartMode` is kept in the form even while `triggerMode` is `manual`, so a user who switches
// to automatic and back keeps their previous threshold selection instead of losing it.

export type RecordingTriggerMode = 'manual' | 'auto';

export interface RecordingTriggerFormValue {
	triggerMode: RecordingTriggerMode;
	autoStartMode: MeetRecordingAutoStartMode;
}

export type RecordingTriggerFormGroup = FormGroup<{
	triggerMode: FormControl<RecordingTriggerMode>;
	autoStartMode: FormControl<MeetRecordingAutoStartMode>;
}>;

/**
 * Maps a persisted `config.recording.autoStart` value to the wizard's two-level trigger selection:
 * the top-level manual/automatic mode, and the threshold to preselect if the user switches to
 * automatic (defaults to the first-participant threshold).
 */
export function autoStartToTriggerFormValue(
	autoStart: MeetRecordingAutoStartMode | null | undefined
): RecordingTriggerFormValue {
	return {
		triggerMode: autoStart ? 'auto' : 'manual',
		autoStartMode: autoStart ?? MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS
	};
}

/**
 * Maps the wizard's two-level trigger selection back to the persisted `config.recording.autoStart`
 * value. `manual` maps to `null` (not `undefined`) so the wizard's own deep-merge of step data can
 * distinguish "explicitly turned off" from "field not touched by this step". Takes the full,
 * non-partial form value (e.g. `getRawValue()`) so a field missing from a `valueChanges` emission
 * (which types as `Partial`, e.g. while a control is disabled) can't be mistaken for "manual".
 */
export function triggerFormValueToAutoStart(formValue: RecordingTriggerFormValue): MeetRecordingAutoStartMode | null {
	if (formValue.triggerMode !== 'auto') return null;

	return formValue.autoStartMode;
}

// Form value and group types for the recording layout step

export interface RecordingLayoutFormValue {
	layout: MeetRecordingLayout;
}

export type RecordingLayoutFormGroup = FormGroup<{
	layout: FormControl<MeetRecordingLayout>;
}>;

/**
 * Mapping of wizard step identifiers to their corresponding form groups
 */
export type WizardStepFormGroupMap = {
	[WizardStepId.ROOM_DETAILS]: RoomDetailsFormGroup;
	[WizardStepId.ROOM_CONFIG]: RoomConfigFormGroup;
	[WizardStepId.ROOM_ACCESS]: RoomAccessFormGroup;
	[WizardStepId.RECORDING]: RecordingFormGroup;
	[WizardStepId.RECORDING_TRIGGER]: RecordingTriggerFormGroup;
	[WizardStepId.RECORDING_LAYOUT]: RecordingLayoutFormGroup;
};

/**
 * Type representing any wizard step with its specific form group type
 */
export type AnyWizardStep = {
	[K in WizardStepId]: WizardStep<K, WizardStepFormGroupMap[K]>;
}[WizardStepId];
