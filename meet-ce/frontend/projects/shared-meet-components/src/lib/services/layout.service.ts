import { Injectable } from '@angular/core';
import { LayoutService, LoggerService, ViewportService } from 'openvidu-components-angular';
import { Observable, Subject } from 'rxjs';
import { MeetLayoutMode } from '../models/layout.model';
import { MeetStorageService } from './storage.service';

@Injectable({
	providedIn: 'root'
})
export class MeetLayoutService extends LayoutService {
	private layoutMode: MeetLayoutMode = MeetLayoutMode.DEFAULT;
	layoutModeSubject: Subject<MeetLayoutMode> = new Subject<MeetLayoutMode>();
	layoutMode$: Observable<MeetLayoutMode> = this.layoutModeSubject.asObservable();

	constructor(
		protected loggerService: LoggerService,
		protected viewPortService: ViewportService,
		private storageService: MeetStorageService
	) {
		super(loggerService, viewPortService);
		this.log = this.loggerService.get('MeetLayoutService');

		this.initializeLayoutMode();
	}

	/**
	 * Initializes the layout mode for the application.
	 *
	 * This method retrieves the layout mode from the storage service. If the retrieved
	 * layout mode is valid and exists in the `LayoutMode` enum, it sets the layout mode
	 * to the retrieved value. Otherwise, it defaults to `LayoutMode.DEFAULT`.
	 */
	private initializeLayoutMode() {
		const layoutMode = this.storageService.getLayoutMode();
		if (layoutMode && Object.values(MeetLayoutMode).includes(layoutMode)) {
			this.layoutMode = layoutMode;
		} else {
			this.layoutMode = MeetLayoutMode.DEFAULT;
		}
	}

	/**
	 * Checks if the current layout mode is set to display the last speakers.
	 *
	 * @returns {boolean} `true` if the layout mode is set to `LAST_SPEAKERS`, otherwise `false`.
	 */
	isLastSpeakersLayoutEnabled(): boolean {
		return this.layoutMode === MeetLayoutMode.LAST_SPEAKERS;
	}

	setLayoutMode(layoutMode: MeetLayoutMode) {
		const layoutNeedsUpdate = this.layoutMode !== layoutMode && Object.values(MeetLayoutMode).includes(layoutMode);

		if (!layoutNeedsUpdate) {
			return;
		}

		this.log.d(`Layout mode updated from ${this.layoutMode} to ${layoutMode}`);
		this.layoutMode = layoutMode;
		this.layoutModeSubject.next(this.layoutMode);
		this.storageService.setLayoutMode(layoutMode);
		this.update();
	}

	getLayoutMode(): MeetLayoutMode {
		return this.layoutMode;
	}
}
