import { Provider } from '@angular/core';
import { MEETING_CONTEXT_ADAPTER } from '../../../shared/adapters';
import { MeetingContextService } from '../services/meeting-context.service';

/**
 * Provides the MeetingContextAdapter using the existing MeetingContextService.
 * This allows shared guards to use the adapter interface without depending on domain services.
 */
export const MEETING_CONTEXT_ADAPTER_PROVIDER: Provider = {
	provide: MEETING_CONTEXT_ADAPTER,
	useExisting: MeetingContextService
};
