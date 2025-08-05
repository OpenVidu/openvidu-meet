import { Component, EventEmitter, OnDestroy, Output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';

@Component({
	selector: 'ov-room-basic-creation',
	standalone: true,
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatTooltipModule
	],
	templateUrl: './room-basic-creation.component.html',
	styleUrl: './room-basic-creation.component.scss'
})
export class RoomBasicCreationComponent implements OnDestroy {
	@Output() createRoom = new EventEmitter<string | undefined>();
	@Output() openAdvancedMode = new EventEmitter<void>();

	roomCreationForm = new FormGroup({
		roomName: new FormControl('Room', [Validators.maxLength(50)])
	});

	private destroy$ = new Subject<void>();

	constructor() {
		this.roomCreationForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			// Optional: Save form data to local storage or service if needed
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	onCreateRoom() {
		if (this.roomCreationForm.valid) {
			const formValue = this.roomCreationForm.value;
			this.createRoom.emit(formValue.roomName || undefined);
		}
	}

	onOpenAdvancedMode() {
		this.openAdvancedMode.emit();
	}

	get isFormValid(): boolean {
		return this.roomCreationForm.valid && !this.roomCreationForm.pending;
	}
}
