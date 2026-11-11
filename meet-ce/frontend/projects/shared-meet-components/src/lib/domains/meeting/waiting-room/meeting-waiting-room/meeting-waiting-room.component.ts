import { Component, TemplateRef, viewChild } from '@angular/core';
import { WaitingOutcomeComponent } from '../waiting-outcome/waiting-outcome.component';
import { WaitingScreenComponent } from '../waiting-screen/waiting-screen.component';

/**
 * Exposes the waiting room's screens to `MeetingComponent`, which reads them through `contentChild`:
 * `screen` while the participant waits, inside the meeting view, and `outcome` once the wait ended
 * without them being let in. Each screen is instantiated when it shows, so an edition replaces either
 * by projecting its own composition instead of this one.
 */
@Component({
	selector: 'ov-meeting-waiting-room',
	templateUrl: './meeting-waiting-room.component.html',
	imports: [WaitingScreenComponent, WaitingOutcomeComponent]
})
export class MeetingWaitingRoomComponent {
	readonly screen = viewChild.required<TemplateRef<unknown>>('screen');
	readonly outcome = viewChild.required<TemplateRef<unknown>>('outcome');
}
