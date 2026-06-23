import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { MeetRoomDeletionPolicyWithMeeting, MeetRoomDeletionPolicyWithRecordings } from '@openvidu-meet/typings';
import type { DeleteRoomDialogOptions } from '../../../../shared/models';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
	selector: 'ov-delete-room-dialog',
	imports: [
		FormsModule,
		MatButtonModule,
		MatIconModule,
		MatRadioModule,
		MatDialogActions,
		MatDialogContent,
		MatDialogTitle,
		TranslatePipe
	],
	templateUrl: './delete-room-dialog.component.html',
	styleUrl: './delete-room-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteRoomDialogComponent {
	readonly dialogRef = inject(MatDialogRef<DeleteRoomDialogComponent>);
	readonly data: DeleteRoomDialogOptions = inject(MAT_DIALOG_DATA);

	meetingPolicyOptions = [
		{
			value: MeetRoomDeletionPolicyWithMeeting.FORCE,
			label: 'ROOMS.DELETE_DIALOG.MEETING_FORCE_LABEL',
			description: 'ROOMS.DELETE_DIALOG.MEETING_FORCE_DESC'
		},
		{
			value: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
			label: 'ROOMS.DELETE_DIALOG.MEETING_WHEN_ENDS_LABEL',
			description: 'ROOMS.DELETE_DIALOG.MEETING_WHEN_ENDS_DESC'
		},
		{
			value: MeetRoomDeletionPolicyWithMeeting.FAIL,
			label: 'ROOMS.DELETE_DIALOG.MEETING_FAIL_LABEL',
			description: 'ROOMS.DELETE_DIALOG.MEETING_FAIL_DESC'
		}
	];
	recordingPolicyOptions = [
		{
			value: MeetRoomDeletionPolicyWithRecordings.FORCE,
			label: 'ROOMS.DELETE_DIALOG.RECORDINGS_FORCE_LABEL',
			description: 'ROOMS.DELETE_DIALOG.RECORDINGS_FORCE_DESC'
		},
		{
			value: MeetRoomDeletionPolicyWithRecordings.CLOSE,
			label: 'ROOMS.DELETE_DIALOG.RECORDINGS_CLOSE_LABEL',
			description: 'ROOMS.DELETE_DIALOG.RECORDINGS_CLOSE_DESC'
		},
		{
			value: MeetRoomDeletionPolicyWithRecordings.FAIL,
			label: 'ROOMS.DELETE_DIALOG.RECORDINGS_FAIL_LABEL',
			description: 'ROOMS.DELETE_DIALOG.RECORDINGS_FAIL_DESC'
		}
	];

	selectedMeetingPolicy = signal(MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS);
	selectedRecordingPolicy = signal(MeetRoomDeletionPolicyWithRecordings.CLOSE);

	close(type: 'confirm' | 'cancel'): void {
		this.dialogRef.close();

		if (type === 'confirm') {
			this.data.confirmCallback(this.selectedMeetingPolicy(), this.selectedRecordingPolicy());
		}
	}
}
