import { SQLiteClient } from './sqlite/client';

declare global {
  var dbClient: SQLiteClient | undefined;
}

export {};
