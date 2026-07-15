import { Component, input, output } from '@angular/core';

/**
 * Presentational panel that renders the event log. It owns no state: entries
 * are passed in and the clear action is emitted back to the parent.
 */
@Component({
	selector: 'app-event-log',
	templateUrl: './event-log.html',
	styleUrl: './event-log.css'
})
export class EventLog {
	/** Log lines to display, newest first. */
	readonly entries = input.required<readonly string[]>();

	/** Emitted when the user clicks "Clear". */
	readonly clear = output<void>();
}
