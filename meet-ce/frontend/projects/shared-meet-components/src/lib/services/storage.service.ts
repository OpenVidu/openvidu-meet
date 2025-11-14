import { Injectable } from '@angular/core';
import { LoggerService, StorageService } from 'openvidu-components-angular';
import { MeetLayoutMode } from '../models/layout.model';
import { STORAGE_PREFIX, MeetStorageKeys } from '../models/storage.model';

@Injectable({
	providedIn: 'root'
})
export class MeetStorageService extends StorageService {
	constructor(loggerSrv: LoggerService) {
		super(loggerSrv);
		this.PREFIX_KEY = STORAGE_PREFIX;
	}

	/**
	 * Sets the layout mode in the storage.
	 *
	 * @param layoutMode - The layout mode to be set.
	 */
	setLayoutMode(layoutMode: MeetLayoutMode) {
		this.set(MeetStorageKeys.LAYOUT_MODE, layoutMode);
	}

	/**
	 * Retrieves the current layout mode from storage.
	 *
	 * @returns {string} The layout mode stored in the storage, or an empty string if not found.
	 */
	getLayoutMode(): MeetLayoutMode | null {
		return this.get(MeetStorageKeys.LAYOUT_MODE) || null;
	}
}
