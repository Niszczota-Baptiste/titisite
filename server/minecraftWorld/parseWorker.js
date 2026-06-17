import fs from 'node:fs';
import zlib from 'node:zlib';
import { parentPort, workerData } from 'node:worker_threads';
import { parseWorld } from './parse.js';

// Worker de parsing one-shot : lit + parse le monde hors du thread requête, écrit
// l'artefact sparse gzippé sur disque, et ne renvoie que des métadonnées légères
// (palette + BOM + dimensions), jamais les millions de blocs.
(async () => {
  try {
    const { filePath, originalName, bbox, maxBlocks, dataFilePath } = workerData;
    const res = await parseWorld({ filePath, originalName, bbox, maxBlocks });
    const json = JSON.stringify({
      palette: res.palette, min: res.min, size: res.size, count: res.count, blocks: res.blocks,
    });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dataFilePath is a UUID under uploads/
    fs.writeFileSync(dataFilePath, zlib.gzipSync(Buffer.from(json)));
    parentPort.postMessage({
      ok: true, palette: res.palette, bom: res.bom, min: res.min, size: res.size, count: res.count,
    });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e?.message || 'parse_failed' });
  }
})();
