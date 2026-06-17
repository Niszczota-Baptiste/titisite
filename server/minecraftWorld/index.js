import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const here = path.dirname(fileURLToPath(import.meta.url));

// Lance le parsing dans un worker_threads et résout avec les métadonnées
// (palette, BOM, min, size, count). L'artefact sparse gzippé est écrit par le
// worker à `dataFilePath`.
export function parseWorldFile(opts) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(here, 'parseWorker.js'), {
      workerData: opts,
      // N'hérite pas de flags parents incompatibles avec un worker fichier
      // (ex. --input-type) ; garde les options mémoire éventuelles.
      execArgv: process.execArgv.filter((a) => !a.startsWith('--input-type')),
    });
    let settled = false;
    worker.once('message', (m) => {
      settled = true;
      worker.terminate();
      if (m?.ok) resolve(m);
      else reject(new Error(m?.error || 'parse_failed'));
    });
    worker.once('error', (e) => { settled = true; reject(e); });
    worker.once('exit', (code) => { if (!settled && code !== 0) reject(new Error(`worker_exit_${code}`)); });
  });
}
