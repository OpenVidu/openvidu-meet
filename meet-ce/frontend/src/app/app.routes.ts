import { Routes } from '@angular/router';
import { baseRoutes } from '@openvidu-meet/shared-components';
import { AppCeMeetingComponent } from './customization/pages/app-ce-meeting/app-ce-meeting.component';

/**
 * CE routes configure the plugin system using library components.
 * The library's MeetingComponent uses content projection to allow customization
 */
const routes = baseRoutes;
const meetingRoute = routes.find((route) => route.path === 'room/:room-id')!;
meetingRoute.component = AppCeMeetingComponent;

export const ceRoutes: Routes = routes;
