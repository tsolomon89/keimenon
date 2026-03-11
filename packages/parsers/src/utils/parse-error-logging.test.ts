import { afterEach, describe, expect, it, vi } from 'vitest';
import { logParserError } from './parse-error-logging';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_PARSER_LOG_LEVEL = process.env.PARSER_LOG_LEVEL;

describe('logParserError', () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.PARSER_LOG_LEVEL = ORIGINAL_PARSER_LOG_LEVEL;
    vi.restoreAllMocks();
  });

  it('stays silent by default in test environment', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.PARSER_LOG_LEVEL;

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logParserError('GenericParser', new Error('Unexpected token in JSON at position 2'));

    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs expected parse failures in debug mode', () => {
    process.env.NODE_ENV = 'test';
    process.env.PARSER_LOG_LEVEL = 'debug';

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logParserError('GenericParser', new Error('Invalid JSON payload'));

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy.mock.calls[0][0]).toContain('[GenericParser] parse failure');
  });

  it('logs only unexpected failures in error mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.PARSER_LOG_LEVEL = 'error';

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logParserError('GeminiParser', new Error('Network connection refused'));
    logParserError('GeminiParser', new Error('Unexpected token in JSON at position 1'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('[GeminiParser] parse error');
    expect(errorSpy.mock.calls[0][0]).toContain('Network connection refused');
  });
});
