export const enum SystemEventType {
	/**
	 * Event emitted when a egress is active.
	 */
	RECORDING_ACTIVE = 'recording_active'
}

export interface SystemEventPayload {
	eventType: string;
	payload: Record<string, unknown>;
}
