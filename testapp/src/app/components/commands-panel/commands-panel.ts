import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MeetCommandsService } from '../../services/meet-commands';

/**
 * Commands tab: every call of the embedded API, grouped by what it acts on
 * rather than by which spelling of the API it belongs to. The panel holds no
 * state of its own; arguments and dispatch live in `MeetCommandsService`.
 */
@Component({
	selector: 'app-commands-panel',
	imports: [FormsModule],
	templateUrl: './commands-panel.html',
	styleUrl: './commands-panel.css'
})
export class CommandsPanel {
	protected readonly commands = inject(MeetCommandsService);
}
