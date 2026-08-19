import fs from 'fs';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import type { SystemInfo } from '../models/system-info.model.js';
import { infoJsonPath, packageJsonPath } from './path.utils.js';

interface BuildInfo {
	gitCommit: string;
	buildDate: string;
}

// info.json is gitignored and only written by 'meet.sh build-info': it won't exist yet on a
// fresh checkout, in dev mode, or in unit tests that don't go through a full build.
const UNKNOWN_BUILD_INFO: BuildInfo = { gitCommit: 'unknown', buildDate: 'unknown' };

let cachedVersion: string | null = null;
let cachedBuildInfo: BuildInfo | null = null;

const getVersion = (): string => {
	if (cachedVersion === null) {
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version: string };
		cachedVersion = pkg.version;
	}

	return cachedVersion;
};

const getBuildInfo = (): BuildInfo => {
	if (cachedBuildInfo === null) {
		try {
			cachedBuildInfo = JSON.parse(fs.readFileSync(infoJsonPath, 'utf-8')) as BuildInfo;
		} catch {
			cachedBuildInfo = UNKNOWN_BUILD_INFO;
		}
	}

	return cachedBuildInfo;
};

export const getSystemInfo = (): SystemInfo => {
	const buildInfo = getBuildInfo();

	return {
		service: MEET_ENV.NAME_ID,
		version: getVersion(),
		gitCommit: buildInfo.gitCommit,
		buildDate: buildInfo.buildDate,
		edition: MEET_ENV.EDITION,
		// environment: process.env.NODE_ENV ?? 'production',
		apiVersion: INTERNAL_CONFIG.API_BASE_PATH_V1.split('/').pop() ?? 'v1'
	};
};
