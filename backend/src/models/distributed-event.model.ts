export const enum DistributedEventType {
	/**
	 * Event emitted when a egress is active.
	 */
	RECORDING_ACTIVE = 'recording_active'
}

export interface DistributedEventPayload {
	eventType: DistributedEventType;
	payload: Record<string, unknown>;
}
