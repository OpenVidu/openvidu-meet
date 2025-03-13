import { Component, OnDestroy, OnInit } from '@angular/core';
import {
	FormBuilder,
	FormGroup,
	UntypedFormBuilder,
	Validators,
	FormsModule,
	ReactiveFormsModule
} from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIconButton, MatButton } from '@angular/material/button';
import { NgClass } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { ActivatedRoute, Router } from '@angular/router';

import { Subscription } from 'rxjs';

// import { ConfigService } from '@app/services/config.service';
import { HttpService, OpenViduMeetRoom, OpenViduMeetRoomOptions } from 'projects/shared-meet-components/src/public-api';

import packageInfo from '../../../../package.json';

import { animals, colors, Config, uniqueNamesGenerator } from 'unique-names-generator';

@Component({
	selector: 'app-home',
	templateUrl: './home.component.html',
	styleUrls: ['./home.component.scss'],
	standalone: true,
	imports: [MatToolbar, MatIconButton, MatTooltip, MatIcon, FormsModule, ReactiveFormsModule, NgClass, MatButton]
})
export class HomeComponent implements OnInit, OnDestroy {
	roomForm: FormGroup;
	loginForm: FormGroup;
	version = '';
	isPrivateAccess = false;
	username = '';
	loginError = false;
	serverConnectionError = false;
	isUserLogged = false;
	loading = true;
	private queryParamSubscription!: Subscription;

	constructor(
		private router: Router,
		public formBuilder: UntypedFormBuilder,
		private httpService: HttpService,
		// private callService: ConfigService,
		private fb: FormBuilder,
		private route: ActivatedRoute
	) {
		this.loginForm = this.fb.group({
			username: [
				/*this.storageService.getParticipantName() ??*/ '',
				[Validators.required, Validators.minLength(4)]
			],
			password: ['', [Validators.required, Validators.minLength(4)]]
		});

		this.roomForm = this.fb.group({
			roomNamePrefix: [this.getRandomName(), [Validators.required, Validators.minLength(6)]]
		});
	}

	async ngOnInit() {
		this.version = packageInfo.version;
		this.subscribeToQueryParams();

		try {
			// await this.callService.initialize();
			// this.isPrivateAccess = this.callService.isPrivateAccess();

			if (this.isPrivateAccess) {
				this.isUserLogged = true;
				this.loginError = false;
			}
		} catch (error) {
			this.isUserLogged = false;
			// this.serverConnectionError = true;
			this.loginError = true;
		} finally {
			this.loading = false;
		}
	}

	ngOnDestroy(): void {
		if (this.queryParamSubscription) this.queryParamSubscription.unsubscribe();
	}

	generateRoomName(event: any) {
		event.preventDefault();
		this.roomForm.get('roomNamePrefix')?.setValue(this.getRandomName());
	}

	clearRoomName() {
		this.roomForm.get('roomNamePrefix')?.setValue('');
	}

	keyDown(event: KeyboardEvent) {
		if (event.keyCode === 13) {
			event.preventDefault();
			this.goToVideoRoom();
		}
	}

	async login() {
		// Invoked when login form is valid
		this.loginError = false;
		this.username = this.loginForm.get('username')?.value;
		const password = this.loginForm.get('password')?.value;

		try {
			await this.httpService.userLogin({ username: this.username, password });
			this.isUserLogged = true;
		} catch (error) {
			this.isUserLogged = false;
			this.loginError = true;
			console.error('Error doing login ', error);
		}
	}

	async logout() {
		try {
			await this.httpService.userLogout();
			this.loginError = false;
			this.isUserLogged = false;
		} catch (error) {
			console.error('Error doing logout ', error);
		}
	}

	async goToVideoRoom() {
		if (!this.roomForm.valid) {
			console.error('Room name is not valid');
			return;
		}

		const roomNamePrefix = this.roomForm.get('roomNamePrefix')?.value.replace(/ /g, '-');

		try {
			// TODO: Fix expiration date
			const options: OpenViduMeetRoomOptions = {
				roomNamePrefix,
				expirationDate: Date.now() + 3600
			};

			const room: OpenViduMeetRoom = await this.httpService.createRoom(options);

			this.roomForm.get('roomNamePrefix')?.setValue(roomNamePrefix);

			const isFirstParticipant = room.numParticipants === 0;
			const accessRoomUrl = new URL(isFirstParticipant ? room.moderatorRoomUrl : room.publisherRoomUrl);

			const secret = accessRoomUrl.searchParams.get('secret');
			const path = accessRoomUrl.pathname;
			this.router.navigate([path], { queryParams: { secret } });
		} catch (error) {
			console.error('Error creating room ', error);
		}
	}

	private subscribeToQueryParams(): void {
		// this.queryParamSubscription = this.route.queryParams.subscribe((params) => {
		// 	const roomName = params['roomName'];
		// 	if (roomName) {
		// 		this.loginError = true;
		// 		this.roomForm.get('roomNamePrefix')?.setValue(roomName.replace(/[^\w-]/g, ''));
		// 	}
		// });
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
