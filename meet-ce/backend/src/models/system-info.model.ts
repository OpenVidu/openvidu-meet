/**
 * Response payload for GET /info.
 */
export interface SystemInfo {
	service: string;
	version: string;
	gitCommit: string;
	buildDate: string;
	edition: string;
	// environment: string;
	apiVersion: string;
}
