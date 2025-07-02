export interface AppData {
	mode: ApplicationMode;
	edition: Edition;
	version: string;
}

export enum ApplicationMode {
	EMBEDDED = 'embedded',
	STANDALONE = 'standalone'
}

export enum Edition {
	CE = 'ce',
	PRO = 'pro'
}
