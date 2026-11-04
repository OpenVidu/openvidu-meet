import { ElementRef, inject, Injectable } from '@angular/core';
import { isShortcut } from '../utils/keyboard-shortcut.utils';

/**
 * Tells the meeting's buttons whether a key press is one of its shortcuts. The meeting's root is read from the
 * meeting page, which stays in the page while a compact toolbar keeps those buttons in its closed More options menu.
 */
@Injectable()
export class MeetingShortcutsService {
	private readonly meeting = inject<ElementRef<HTMLElement>>(ElementRef);

	isShortcut(event: Event): boolean {
		return isShortcut(event, this.meeting.nativeElement.getRootNode());
	}
}
