import { Routes } from '@angular/router';
import { authDomainRoutes } from '../../domains/auth/routes/auth.routes';
import { consoleDomainRoutes } from '../../domains/console/routes/console.routes';
import { meetingDomainRoutes } from '../../domains/meeting/routes/meeting.routes';
import { recordingsDomainRoutes } from '../../domains/recordings/routes/recordings.routes';
import { roomsDomainRoutes } from '../../domains/rooms/routes/rooms.routes';
import { usersDomainRoutes } from '../../domains/users/routes/users.routes';

export const baseRoutes: Routes = [
	// Auth domain routes
	...authDomainRoutes.map((config) => config.route),

	// Meeting domain routes
	...meetingDomainRoutes.map((config) => config.route),

	// Rooms domain public routes
	...roomsDomainRoutes.map((config) => config.route),

	// Recordings domain public routes
	...recordingsDomainRoutes.map((config) => config.route),

	// Users domain public routes
	...usersDomainRoutes.map((config) => config.route),

	// Console domain routes (includes console shell, child routes, and guards)
	...consoleDomainRoutes,

	// Redirect all other routes to the console
	{ path: '**', redirectTo: '' }
];
