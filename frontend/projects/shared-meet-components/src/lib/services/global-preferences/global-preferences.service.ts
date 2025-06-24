import { Injectable } from '@angular/core';
import { LoggerService } from 'openvidu-components-angular';
import { HttpService } from '../../services';
import { MeetRoomPreferences, SecurityPreferences } from '../../typings/ce';

@Injectable({
	providedIn: 'root'
})
// This service is used to store the global preferences of the application
export class GlobalPreferencesService {
	protected readonly PREFERENCES_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/preferences`;

	protected log;
	protected roomPreferences: MeetRoomPreferences | undefined;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - GlobalPreferencesService');
	}

	async getSecurityPreferences(): Promise<SecurityPreferences> {
		const path = `${this.PREFERENCES_API}/security`;
		return this.httpService.getRequest(path);
	}
}
