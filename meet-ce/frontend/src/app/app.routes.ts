import { Routes } from '@angular/router';
import { baseRoutes, MeetingComponent } from '@openvidu-meet/shared-components';
import { MEETING_CE_PROVIDERS } from './customization';

/**
 * CE routes configure the plugin system using library components.
 * The library's MeetingComponent uses NgComponentOutlet to render plugins dynamically.
 */
const routes = baseRoutes;
const meetingRoute = routes.find((route) => route.path === 'room/:room-id')!;
meetingRoute.component = MeetingComponent;
meetingRoute.providers = MEETING_CE_PROVIDERS;

export const ceRoutes: Routes = routes;
