import { Component, OnInit } from '@angular/core';
import { FormGroup, Validators, FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIconButton, MatButton } from '@angular/material/button';
import { NgClass } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { ContextService, HttpService } from '../../services/index';
import { OpenViduMeetRoom, OpenViduMeetRoomOptions } from '../../typings/ce/room';
import { animals, colors, Config, uniqueNamesGenerator } from 'unique-names-generator';

@Component({
	selector: 'app-room-creator',
	templateUrl: './room-creator.component.html',
	styleUrls: ['./room-creator.component.scss'],
	standalone: true,
	imports: [MatToolbar, MatIconButton, MatTooltip, MatIcon, FormsModule, ReactiveFormsModule, NgClass, MatButton]
})
export class RoomCreatorComponent implements OnInit {
	version = '';
	openviduLogoUrl = '';
	backgroundImageUrl = '';

	roomForm = new FormGroup({
		roomNamePrefix: new FormControl(this.getRandomName(), [Validators.required, Validators.minLength(6)])
	});
	username = '';

	constructor(
		private router: Router,
		private httpService: HttpService,
		private contextService: ContextService
	) {}

	async ngOnInit() {
		this.version = this.contextService.getVersion();
		this.openviduLogoUrl = this.contextService.getOpenViduLogoUrl();
		this.backgroundImageUrl = this.contextService.getBackgroundImageUrl();

		// TODO: Retrieve actual username
		this.username = 'user';
	}

	generateRoomName(event: any) {
		event.preventDefault();
		this.roomForm.get('roomNamePrefix')?.setValue(this.getRandomName());
	}

	clearRoomName() {
		this.roomForm.get('roomNamePrefix')?.setValue('');
	}

	async logout() {
		try {
			await this.httpService.userLogout();
		} catch (error) {
			console.error('Error doing logout ', error);
		}
	}

	async goToVideoRoom() {
		if (!this.roomForm.valid) {
			console.error('Room name is not valid');
			return;
		}

		const roomNamePrefix = this.roomForm.get('roomNamePrefix')?.value!.replace(/ /g, '-');

		try {
			// TODO: Fix expiration date
			const options: OpenViduMeetRoomOptions = {
				roomNamePrefix,
				expirationDate: Date.now() + 3600 * 1000 // 1 hour
			};

			const room: OpenViduMeetRoom = await this.httpService.createRoom(options);

			const accessRoomUrl = new URL(room.moderatorRoomUrl);
			const secret = accessRoomUrl.searchParams.get('secret');
			const roomName = accessRoomUrl.pathname;

			this.router.navigate([roomName], { queryParams: { secret } });
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
