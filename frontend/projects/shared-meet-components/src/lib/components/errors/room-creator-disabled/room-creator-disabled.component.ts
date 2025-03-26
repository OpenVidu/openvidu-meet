import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
	selector: 'ov-room-creator-disabled',
	standalone: true,
	imports: [MatCardModule],
	templateUrl: './room-creator-disabled.component.html',
	styleUrl: './room-creator-disabled.component.scss'
})
export class RoomCreatorDisabledComponent {}
