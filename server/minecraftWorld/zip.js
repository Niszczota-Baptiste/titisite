import zlib from 'node:zlib';

// Lecteur ZIP minimal (sans dépendance) : on lit le central directory puis on
// extrait uniquement les entrées « r.X.Z.mca » (deflate ou stored). Suffisant
// pour un export de dossier region/ Minecraft. ZIP64 non géré (rare ici).

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

const MCA_RE = /(?:^|\/)r\.(-?\d+)\.(-?\d+)\.mca$/;

function findEocd(buf) {
  // L'EOCD fait ≥ 22 octets et peut être suivi d'un commentaire (≤ 65535).
  const min = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

// Renvoie [{ name, regionX, regionZ, data:Buffer }] pour chaque r.X.Z.mca.
export function extractMcaEntries(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('zip_invalid');
  const total = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  if (ptr === 0xffffffff) throw new Error('zip64_unsupported');

  const out = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(ptr) !== CEN_SIG) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    const m = name.match(MCA_RE);
    if (!m) continue;
    if (localOff === 0xffffffff || compSize === 0xffffffff) throw new Error('zip64_unsupported');

    // Saut au local header pour trouver le début réel des données.
    if (buf.readUInt32LE(localOff) !== LOC_SIG) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);

    out.push({ name, regionX: Number(m[1]), regionZ: Number(m[2]), data });
  }
  return out;
}

// Déduit (regionX, regionZ) du nom d'un .mca isolé (« r.0.-1.mca »).
export function regionCoordsFromName(name) {
  const m = String(name || '').match(MCA_RE);
  return m ? { regionX: Number(m[1]), regionZ: Number(m[2]) } : null;
}
