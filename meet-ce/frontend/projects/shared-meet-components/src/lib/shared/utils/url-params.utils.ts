import { ActivatedRouteSnapshot } from '@angular/router';
import { WebComponentProperty } from '@openvidu-meet/typings';

export const extractParams = ({ params, queryParams }: ActivatedRouteSnapshot) => ({
	roomId: params['room-id'] as string,
	secret: queryParams['secret'] as string | undefined,
	participantName: queryParams[WebComponentProperty.PARTICIPANT_NAME] as string | undefined,
	leaveRedirectUrl: queryParams[WebComponentProperty.LEAVE_REDIRECT_URL] as string | undefined,
	showOnlyRecordings: (queryParams[WebComponentProperty.SHOW_ONLY_RECORDINGS] as string) || 'false',
	e2eeKey: queryParams[WebComponentProperty.E2EE_KEY] as string | undefined
});
