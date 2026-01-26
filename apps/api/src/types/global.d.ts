import { DatabaseClient } from '@keimenon/db';

declare global {
  var dbClient: DatabaseClient | undefined;
}

export {};
