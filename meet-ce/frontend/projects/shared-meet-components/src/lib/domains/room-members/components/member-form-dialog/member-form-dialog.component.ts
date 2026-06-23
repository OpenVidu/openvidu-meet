import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MeetRoomMemberOptions } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { MemberFormDialogData } from '../../models/member-form.model';
import { MemberFormComponent } from '../member-form/member-form.component';

@Component({
	selector: 'ov-member-form-dialog',
	imports: [MatDialogModule, MemberFormComponent, MatIconModule, TranslatePipe],
	templateUrl: './member-form-dialog.component.html',
	styleUrl: './member-form-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MemberFormDialogComponent {
	private dialogRef = inject(MatDialogRef<MemberFormDialogComponent, MeetRoomMemberOptions | null>);
	protected data = inject<MemberFormDialogData>(MAT_DIALOG_DATA);

	onMemberSubmitted(options: MeetRoomMemberOptions): void {
		this.dialogRef.close(options);
	}

	onCancelled(): void {
		this.dialogRef.close(null);
	}
}
