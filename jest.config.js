module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages', '<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@mcpshield/(.*)$': '<rootDir>/packages/$1/src'
  },
  testTimeout: 30000,
  verbose: true
};
