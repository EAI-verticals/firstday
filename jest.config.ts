import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
})

// Add any custom config to be passed to Jest
const config: Config = {
    preset: 'ts-jest',
    coverageProvider: 'v8',
    testEnvironment: 'jsdom',
    // Add more setup options before each test is run
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    modulePathIgnorePatterns: [
        'spec.js',
        'spec.ts',
        'spec.tsx',
        '<rootDir>/.next/',
    ],
    testPathIgnorePatterns: ['<rootDir>/.next/'],
    watchPathIgnorePatterns: ['<rootDir>/.next/'],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
        "^@enterpriseaigroup/platform-sdk$": "<rootDir>/packages/platform-sdk/src/index.ts",
        "^@enterpriseaigroup/platform-sdk/(.*)$": "<rootDir>/packages/platform-sdk/src/$1",
        "^@presentation/(.*)$": "<rootDir>/src/app/(presentation)/$1",
        "^@presentation/hooks/(.*)$": "<rootDir>/src/app/(presentation)/hooks/$1",
        "^@presentation/pages/(.*)$": "<rootDir>/src/app/(presentation)/(pages)/$1",
        "^@domain/(.*)$": "<rootDir>/src/app/domain/$1",
        "^@infrastructure/(.*)$": "<rootDir>/src/app/(infrastructure)/$1",
        "^@application/(.*)$": "<rootDir>/src/app/application/$1",
        "\\.(css|less|scss|sass)$": "identity-obj-proxy",

    },
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest', // Use ts-jest for TypeScript files
    },
    transformIgnorePatterns: ['node_modules/(?!@azure/msal-react)', 'node_modules/(?!@azure/web-pubsub-client)'],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config)
