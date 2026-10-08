// Entry of the bench's worker threads. A worker does not inherit the TypeScript loader of the
// main thread (tsx, Vitest), so it registers tsx before loading the real worker.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
