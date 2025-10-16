import { DatabaseClient } from '@canvas-memory/db';

declare global {
  var dbClient: DatabaseClient | undefined;
}

export {};
