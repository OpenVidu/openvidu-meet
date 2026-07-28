import { inject, Service } from '@angular/core';
import type { SmartLayoutMode } from '../../domains/meeting/openvidu-components';
import type { MeetingThemeMode } from '../../domains/meeting/openvidu-components/models/theme.model';
import { MeetStorageKeys } from '../models/storage.model';
import { BrowserStorageService } from './browser-storage.service';

/**
 * Persists shell-level preferences shared across the whole application (layout, language, theme,
 * last-used participant name) through the single {@link BrowserStorageService} engine (composition —
 * no storage inheritance).
 *
 * This store is the single persisted owner of the user's language and theme preferences: both the
 * shell and the meeting read/write them here.
 */
@Service()
export class MeetStorageService {
	private readonly storage = inject(BrowserStorageService);

	/**
	 * Sets the layout mode in the storage.
	 *
	 * @param layoutMode - The layout mode to be set.
	 */
	setLayoutMode(layoutMode: SmartLayoutMode): void {
		this.storage.set(MeetStorageKeys.LAYOUT_MODE, layoutMode);
	}

	/**
	 * Retrieves the current layout mode from storage.
	 *
	 * @returns {SmartLayoutMode | null} The layout mode stored in the storage, or null if not found.
	 */
	getLayoutMode(): SmartLayoutMode | null {
		return this.storage.get<SmartLayoutMode>(MeetStorageKeys.LAYOUT_MODE);
	}

	/**
	 * Sets the maximum number of visible remote participants for smart layout mode.
	 *
	 * @param count - The maximum number of visible remote participants.
	 */
	setMaxVisibleRemoteParticipants(count: number): void {
		this.storage.set(MeetStorageKeys.MAX_VISIBLE_REMOTE_PARTICIPANTS, count);
	}

	/**
	 * Retrieves the maximum number of visible remote participants from storage.
	 */
	getMaxVisibleRemoteParticipants(): number | null {
		return this.storage.get<number>(MeetStorageKeys.MAX_VISIBLE_REMOTE_PARTICIPANTS);
	}

	/** Retrieves the shared language preference. */
	getLang(): string | null {
		return this.storage.get<string>(MeetStorageKeys.LANG);
	}

	/** Persists the shared language preference. */
	setLang(lang: string): void {
		this.storage.set(MeetStorageKeys.LANG, lang);
	}

	/** Retrieves the shared theme preference. */
	getTheme(): MeetingThemeMode | null {
		return this.storage.get<MeetingThemeMode>(MeetStorageKeys.THEME);
	}

	/** Persists the shared theme preference. */
	setTheme(theme: MeetingThemeMode): void {
		this.storage.set(MeetStorageKeys.THEME, theme);
	}

	/** Removes the shared theme preference (falls back to the system preference). */
	removeTheme(): void {
		this.storage.remove(MeetStorageKeys.THEME);
	}

	/** Retrieves the last participant name used on this device (cross-visit, shared across tabs). */
	getLastParticipantName(): string | null {
		return this.storage.get<string>(MeetStorageKeys.LAST_PARTICIPANT_NAME);
	}

	/** Persists the last participant name used on this device. */
	setLastParticipantName(name: string): void {
		this.storage.set(MeetStorageKeys.LAST_PARTICIPANT_NAME, name);
	}
}
