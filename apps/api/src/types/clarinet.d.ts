declare module 'clarinet' {
  export interface SAXParser {
    on(event: string, handler: (...args: any[]) => void): void;
    write(chunk: Buffer | string): void;
    close(): void;
  }

  export function createStream(): SAXParser;
}
