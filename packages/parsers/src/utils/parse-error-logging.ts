const EXPECTED_PARSE_ERROR_PATTERNS = [
  'unexpected token',
  'unexpected end of json input',
  'expected property name',
  'invalid json',
  'json parse',
  'unterminated string',
  'bad control character',
  'not valid json',
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown parser error';
  }
  return String(error ?? 'Unknown parser error');
}

function isExpectedParseFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return EXPECTED_PARSE_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

type ParserLogLevel = 'silent' | 'error' | 'debug';

function getParserLogLevel(): ParserLogLevel {
  const configured = process.env.PARSER_LOG_LEVEL?.toLowerCase();
  if (configured === 'silent' || configured === 'error' || configured === 'debug') {
    return configured;
  }

  if (process.env.NODE_ENV === 'test') {
    return 'silent';
  }

  return 'error';
}

export function logParserError(parserName: string, error: unknown): void {
  const message = toErrorMessage(error);
  const expected = isExpectedParseFailure(message);
  const logLevel = getParserLogLevel();

  if (logLevel === 'silent') return;

  if (expected && logLevel !== 'debug') return;

  if (logLevel === 'debug') {
    console.debug(`[${parserName}] parse ${expected ? 'failure' : 'error'}: ${message}`);
    return;
  }

  console.error(`[${parserName}] parse error: ${message}`);
}
