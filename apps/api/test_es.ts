import { EventSource } from 'eventsource';

console.log('EventSource Type:', typeof EventSource);
console.log('EventSource Value:', EventSource);

try {
  const es = new EventSource('http://localhost:4001/api/v1/stream/jobs');
  console.log('Constructor success');
  es.close();
} catch (error) {
  console.error('Constructor failed:', error);
}
