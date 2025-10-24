declare module 'JSONStream' {
  import { Transform } from 'stream';

  export function parse(pattern: string): Transform;
  export function stringify(open?: string, sep?: string, close?: string): Transform;
}
