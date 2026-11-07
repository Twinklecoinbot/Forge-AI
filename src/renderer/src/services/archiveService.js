/**
 * Unpack zip (and treat folders) for investigation — Forge's own engine, no Cursor dependency.
 * Uses dynamic import of fflate when available; falls back to telling the user to open the folder.
 */

export async function unpackZipFile(file) {
  const buf = await file.arrayBuffer();
  let unzipSync;
  try {
    const mod = await import('fflate');
    unzipSync = mod.unzipSync;
  } catch {
    throw new Error('Zip support unavailable. Open the extracted project folder instead.');
  }
  if (!unzipSync) throw new Error('Zip unpacker missing.');
  const data = new Uint8Array(buf);
  const unzipped = unzipSync(data);
  const files = [];
  const decoder = new TextDecoder('utf-8');
  for (const [path, bytes] of Object.entries(unzipped)) {
    if (!path || path.endsWith('/')) continue;
    if (/node_modules\/|\.git\/|dist\/|build\//.test(path)) continue;
    if (bytes.byteLength > 1_500_000) continue;
    const text = isProbablyText(path, bytes) ? decoder.decode(bytes) : null;
    if (text == null) continue;
    files.push({
      path: path.replace(/^\/+/, ''),
      content: text,
      language: undefined
    });
  }
  return {
    name: file.name?.replace(/\.zip$/i, '') || 'imported-zip',
    files: files.sort((a, b) => a.path.localeCompare(b.path))
  };
}

function isProbablyText(path, bytes) {
  if (/\.(png|jpe?g|gif|webp|pdf|exe|dll|woff2?|mp[34]|zip)$/i.test(path)) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 800));
  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return false;
    if (b < 7 || (b > 14 && b < 32)) weird++;
  }
  return weird / sample.length < 0.3;
}
