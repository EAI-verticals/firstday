import "@testing-library/jest-dom";
// import "whatwg-fetch";
import { ReadableStream } from 'node:stream/web';

// Node 20 in CI does not expose Web Streams on the Jest global by default.
if (typeof global.ReadableStream === 'undefined') {
    global.ReadableStream = ReadableStream;
}

jest.mock("@tanstack/react-query", () => ({
    ...jest.requireActual("@tanstack/react-query"),
    useQueryClient: jest.fn(),
    useQuery: jest.fn(() => ({ data: [], isLoading: false, isError: false })),
    useMutation: jest.fn(),
}));

module.exports = {
  testTimeout: 30000,
};
