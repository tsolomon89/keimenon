
// @ts-ignore
import * as es from 'event-stream';
// @ts-ignore
import esDefault from 'event-stream';

console.log('--- import * as es ---');
console.log('Type:', typeof es);
console.log('Keys:', Object.keys(es));
console.log('es.mapSync:', typeof es.mapSync);

console.log('\n--- import esDefault ---');
console.log('Type:', typeof esDefault);
console.log('Keys:', esDefault ? Object.keys(esDefault) : 'null');
if (esDefault) {
    console.log('esDefault.mapSync:', typeof esDefault.mapSync);
}
