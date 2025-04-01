import { Component, OnInit } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIconButton, MatButton } from '@angular/material/button';
import { NgClass } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { AuthService, ContextService, HttpService } from '../../services/index';
import { MeetRoom, MeetRoomOptions } from '../../typings/ce/room';
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
		roomIdPrefix: new FormControl(this.getRandomName(), [])
	});
	username = '';

	constructor(
		private router: Router,
		private httpService: HttpService,
		private authService: AuthService,
		private contextService: ContextService
	) {}

	async ngOnInit() {
		this.version = this.contextService.getVersion();
		this.openviduLogoUrl = this.contextService.getOpenViduLogoUrl();
		this.backgroundImageUrl = this.contextService.getBackgroundImageUrl();

		const username = await this.authService.getUsername();
		if (username) {
			this.username = username;
		}
	}

	generateRoomId(event: any) {
		event.preventDefault();
		this.roomForm.get('roomIdPrefix')?.setValue(this.getRandomName());
	}

	clearRoomId() {
		this.roomForm.get('roomIdPrefix')?.setValue('');
	}

	async logout() {
		try {
			await this.authService.logout('login');
		} catch (error) {
			console.error('Error doing logout ', error);
		}
	}

	async goToVideoRoom() {
		if (!this.roomForm.valid) {
			console.error('Room name is not valid');
			return;
		}

		const roomIdPrefix = this.roomForm.get('roomIdPrefix')?.value!.replace(/ /g, '-');

		try {
			// TODO: Fix expiration date
			const options: MeetRoomOptions = {
				roomIdPrefix,
				expirationDate: Date.now() + 3600 * 1000 // 1 hour
			};

			const room: MeetRoom = await this.httpService.createRoom(options);

			const accessRoomUrl = new URL(room.moderatorRoomUrl);
			const secret = accessRoomUrl.searchParams.get('secret');
			const roomId = accessRoomUrl.pathname;

			this.router.navigate([roomId], { queryParams: { secret } });
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
