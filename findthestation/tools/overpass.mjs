// Overpass fetch with mirror fallback, retries and on-disk cache.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const BACKOFF = [15000, 30000, 60000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function overpass(query, cacheKey, { fresh = false } = {}) {
  const file = join(CACHE, `${cacheKey}.json`);
  if (!fresh) {
    try { return JSON.parse(await readFile(file, 'utf8')).elements; } catch { /* miss */ }
  }
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'findthestation-data-builder' },
          body: 'data=' + encodeURIComponent(query),
        });
        const text = await res.text();
        if (!res.ok || !text.startsWith('{')) throw new Error(`${url} -> ${res.status} ${text.slice(0, 80)}`);
        const json = JSON.parse(text);
        if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(`${url} -> ${json.remark}`);
        await mkdir(CACHE, { recursive: true });
        await writeFile(file, text);
        console.log(`  overpass ${cacheKey}: ${json.elements.length} elements (${(text.length / 1e6).toFixed(1)} MB) via ${new URL(url).host}`);
        return json.elements;
      } catch (e) {
        lastErr = e;
        console.warn(`  overpass ${cacheKey}: ${e.message}`);
      }
    }
    if (attempt < 3) await sleep(BACKOFF[attempt]);
  }
  throw lastErr;
}
