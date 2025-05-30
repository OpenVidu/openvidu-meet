import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { HttpService } from '@lib/services';
import { MeetRoom, MeetRoomOptions } from '@lib/typings/ce';
import { animals, colors, Config, uniqueNamesGenerator } from 'unique-names-generator';

@Component({
	selector: 'ov-room-form',
	standalone: true,
	imports: [MatIconButton, MatTooltip, MatIcon, FormsModule, ReactiveFormsModule, CommonModule, MatButton],
	templateUrl: './room-form.component.html',
	styleUrl: './room-form.component.scss'
})
export class RoomFormComponent {
	roomForm = new FormGroup({
		roomIdPrefix: new FormControl(this.getRandomName(), [])
	});

	constructor(
		private router: Router,
		private httpService: HttpService
	) {}

	generateRoomId(event: any) {
		event.preventDefault();
		this.roomForm.get('roomIdPrefix')?.setValue(this.getRandomName());
	}

	clearRoomId() {
		this.roomForm.get('roomIdPrefix')?.setValue('');
	}

	async goToVideoRoom() {
		if (!this.roomForm.valid) {
			console.error('Room name is not valid');
			return;
		}

		const roomIdPrefix = this.roomForm.get('roomIdPrefix')?.value!.replace(/ /g, '-');

		try {
			const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000; // 24h * 60m * 60s * 1000ms

			const options: MeetRoomOptions = {
				roomIdPrefix,
				autoDeletionDate: Date.now() + MILLISECONDS_PER_DAY // Expires 1 day from now
			};

			const room: MeetRoom = await this.httpService.createRoom(options);

			const accessRoomUrl = new URL(room.moderatorRoomUrl);
			const secret = accessRoomUrl.searchParams.get('secret');
			const roomUrl = accessRoomUrl.pathname;

			this.router.navigate([roomUrl], { queryParams: { secret } });
		} catch (error) {
			console.error('Error creating room ', error);
		}
	}

	private getRandomName(): string {
		const configName: Config = {
			dictionaries: [colors, animals],
			separator: '-',
			style: 'lowerCase'
		};
		return uniqueNamesGenerator(configName).replace(/[^\w-]/g, '');
	}
}
