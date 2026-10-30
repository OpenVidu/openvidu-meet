/** Warns that `<openvidu-meet>` rejected a command called before its bundle loaded or before its Meet started. */
export const warnCommandRejected = (command: string): void => {
	console.warn(`[OpenVidu Meet] ${command} rejected: not available in the current meeting phase`);
};
