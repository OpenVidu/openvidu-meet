import { DatePipe } from '@angular/common';
import { Component, input, signal } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../../pipes/translate.pipe';

/** How the activity is doing, which is all its row shows besides the words. */
export type ActivityState = 'idle' | 'pending' | 'live' | 'failed';

/**
 * The shell every activity of the panel shares: the expansion panel, its row (icon, title, status
 * line and time live) and the body, rendered only while the panel is open. The activity projects
 * its body, and sets the row's accent through `--ov-activity-accent`.
 */
@Component({
	selector: 'ov-activity-item',
	imports: [DatePipe, MatExpansionModule, MatIconModule, TranslatePipe],
	templateUrl: './activity-item.component.html',
	styleUrls: ['../activity-shared.scss', './activity-item.component.scss', '../activities-panel.component.scss']
})
export class ActivityItemComponent {
	readonly expanded = input(false);
	/** The Material icon of the activity, shown while nothing has failed. */
	readonly icon = input.required<string>();
	readonly titleKey = input.required<string>();
	readonly statusKey = input.required<string>();
	readonly state = input<ActivityState>('idle');
	/** Something worth a warning next to the status, already translated. */
	readonly detail = input<string | undefined>(undefined);
	/** How long the activity has been live, shown next to the status while it is. */
	readonly elapsed = input<Date | undefined>(undefined);
	/** The id and the `data-status` of the status line, which the tests read. */
	readonly statusId = input.required<string>();
	readonly status = input.required<string>();

	readonly opened = signal(false);
}
