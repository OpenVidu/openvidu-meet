/**
 * Backend Jest config. Tests are transpiled with @swc/jest (transpile-only, no
 * type-checking) instead of ts-jest — the only change from the previous setup,
 * for a much faster transpile.
 *
 * The module system is unchanged: ESM output + `--experimental-vm-modules`
 * (passed by the test scripts). This is required because ESM-only runtime deps
 * (chalk@5) load natively and the cloud SDKs (@aws-sdk/@smithy, ...) use dynamic
 * `import()` internally, which Jest can only service under that flag. Keeping
 * ESM also means `import.meta.url` (path.utils.ts, server.ts) stays native.
 *
 * Injection is fully explicit (`@inject(...)`), so swc does NOT emit decorator
 * metadata (there is no `reflect-metadata` at runtime).
 */

/** @type {import('@swc/core').Options} */
const swcConfig = {
	jsc: {
		parser: { syntax: 'typescript', tsx: true, decorators: true },
		transform: { legacyDecorator: true, decoratorMetadata: false },
		target: 'es2022',
		keepClassNames: true
	},
	module: { type: 'es6' }
};

/** @type {import('jest').Config} */
const jestConfig = {
	displayName: 'backend',
	testTimeout: 60000,
	testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
	moduleFileExtensions: ['js', 'ts', 'json', 'node'],
	testEnvironment: 'node',
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
		'^@openvidu-meet/typings$': '<rootDir>/../typings/src/index.ts',
		'^(\\.{1,2}/.*)\\.js$': '$1' // Allow importing js files and resolving to ts files
	},
	transform: {
		'^.+\\.tsx?$': ['@swc/jest', swcConfig]
	}
};

export default jestConfig;
