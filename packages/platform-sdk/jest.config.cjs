module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/packages/platform-sdk/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/packages/platform-sdk/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
