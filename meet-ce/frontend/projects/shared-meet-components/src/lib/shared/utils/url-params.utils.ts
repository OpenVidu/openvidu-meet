import { ActivatedRouteSnapshot } from '@angular/router';
import { EmbeddedAttribute } from '@openvidu-meet/typings';

export const extractParams = ({ params, queryParams }: ActivatedRouteSnapshot) => ({
	roomId: params['room-id'] as string,
	secret: queryParams['secret'] as string | undefined,
	participantName: queryParams[EmbeddedAttribute.PARTICIPANT_NAME] as string | undefined,
	leaveRedirectUrl: queryParams[EmbeddedAttribute.LEAVE_REDIRECT_URL] as string | undefined,
	showOnlyRecordings: (queryParams[EmbeddedAttribute.SHOW_ONLY_RECORDINGS] as string) || 'false',
	showRecording: queryParams[EmbeddedAttribute.SHOW_RECORDING] as string | undefined,
	e2eeKey: queryParams[EmbeddedAttribute.E2EE_KEY] as string | undefined
});
