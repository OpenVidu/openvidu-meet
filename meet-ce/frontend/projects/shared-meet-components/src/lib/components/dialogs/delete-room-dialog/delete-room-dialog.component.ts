import { ChangeDetectionStrategy, Component, Inject, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogContent,
	MatDialogRef,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import type { DeleteRoomDialogOptions } from '@openvidu-meet/shared/models';
import { MeetRoomDeletionPolicyWithMeeting, MeetRoomDeletionPolicyWithRecordings } from '@openvidu-meet/typings';

@Component({
	selector: 'ov-delete-room-dialog',
	imports: [
		FormsModule,
		MatButtonModule,
		MatIconModule,
		MatRadioModule,
		MatDialogActions,
		MatDialogContent,
		MatDialogTitle
	],
	templateUrl: './delete-room-dialog.component.html',
	styleUrl: './delete-room-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteRoomDialogComponent {
	readonly dialogRef = inject(MatDialogRef<DeleteRoomDialogComponent>);

	meetingPolicyOptions = [
		{
			value: MeetRoomDeletionPolicyWithMeeting.FORCE,
			label: 'Force',
			description:
				'The meeting will be ended immediately, and the room will be deleted without waiting for participants to leave.'
		},
		{
			value: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
			label: 'When meeting ends',
			description: 'The room will be deleted when the meeting ends.'
		},
		{
			value: MeetRoomDeletionPolicyWithMeeting.FAIL,
			label: 'Fail',
			description: 'The deletion will fail if there is an active meeting.'
		}
	];
	recordingPolicyOptions = [
		{
			value: MeetRoomDeletionPolicyWithRecordings.FORCE,
			label: 'Force',
			description: 'The room and its recordings will be deleted immediately.'
		},
		{
			value: MeetRoomDeletionPolicyWithRecordings.CLOSE,
			label: 'Close',
			description: 'The room will be closed instead of deleted, maintaining its recordings.'
		},
		{
			value: MeetRoomDeletionPolicyWithRecordings.FAIL,
			label: 'Fail',
			description: 'The deletion will fail if the room has recordings.'
		}
	];

	selectedMeetingPolicy = MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS;
	selectedRecordingPolicy = MeetRoomDeletionPolicyWithRecordings.CLOSE;

	constructor(@Inject(MAT_DIALOG_DATA) public data: DeleteRoomDialogOptions) {}

	close(type: 'confirm' | 'cancel'): void {
		this.dialogRef.close();

		if (type === 'confirm') {
			this.data.confirmCallback(this.selectedMeetingPolicy, this.selectedRecordingPolicy);
		}
	}
}
