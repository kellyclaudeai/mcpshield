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
    '^@kellyclaude/mcpshield$': '<rootDir>/packages/cli/src',
    '^@kellyclaude/mcpshield-core$': '<rootDir>/packages/core/src',
    '^@kellyclaude/mcpshield-scanner$': '<rootDir>/packages/scanner/src'
  },
  testTimeout: 30000,
  verbose: true
};
