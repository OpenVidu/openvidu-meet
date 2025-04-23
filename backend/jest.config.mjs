import { createDefaultEsmPreset } from 'ts-jest';

/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
	displayName: 'backend',
	...createDefaultEsmPreset({
		tsconfig: 'tsconfig.json'
	}),
	testTimeout: 60000,
	resolver: 'ts-jest-resolver',
	testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
	moduleFileExtensions: ['js', 'ts', 'json', 'node'],
	testEnvironment: 'node',
	moduleNameMapper: {
		'^@typings-ce$': '<rootDir>/src/typings/ce/index.ts'
	},
	globals: {
		'ts-jest': {
			tsconfig: 'tsconfig.json'
		}
	}
	// transform: {
	// 	'^.+\\.tsx?$': ['ts-jest', {
	// 	  // Opcionalmente, especifica el archivo tsconfig si es necesario
	// 	  tsconfig: 'tsconfig.json',
	// 	}],
	//   },
};

export default jestConfig;
