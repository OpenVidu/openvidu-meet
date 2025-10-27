import { createDefaultEsmPreset } from 'ts-jest'

/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
  displayName: 'webcomponent',
  ...createDefaultEsmPreset({
    tsconfig: 'tsconfig.json'
  }),
  // Set the root directory to the webcomponent folder
  rootDir: './',
  resolver: 'ts-jest-resolver',
  testEnvironment: 'jsdom',
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  moduleFileExtensions: ['js', 'ts', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/tests/e2e/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  moduleNameMapper: {
    '^@openvidu-meet/typings$': '<rootDir>/../../typings/src/index.ts',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js'
  }
}

export default jestConfig
