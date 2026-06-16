import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Panel shown inside the participants panel while the local participant is
 * alone in the meeting.
 *
 * Used in webcomponent mode in place of the share/copy link panel
 * (MeetingInvitePanelComponent), where sharing the meeting link is handled by
 * the host application rather than by Meet itself.
 */
@Component({
	selector: 'ov-meeting-waiting-panel',
	templateUrl: './meeting-waiting-panel.component.html',
	styleUrls: ['./meeting-waiting-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingWaitingPanelComponent {
	title = 'Waiting for others to join';
	subtitle = 'Participants will appear here as soon as they join the meeting.';
}
