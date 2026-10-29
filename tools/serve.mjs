// Static dev server: node tools/serve.mjs [port]  (default 8232).
// Cache-Control: no-store on everything: a cached script during a fix pass once cost a whole
// session (lorecannae kb/LESSONS-DIGEST.md section 10). Refused: scratch/, .git/, token files, and
// the raw-source / private-knowledge-base folders under docs/ (never served, never deployed).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2]) || 8232;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const FORBIDDEN = /(^|[\\/])(scratch|\.git)([\\/]|$)|(^|[\\/])docs[\\/](sources|knowledge-base)([\\/]|$)|(^|[\\/])tokens?[^\\/]*$/i;

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^[\\/]+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT) || FORBIDDEN.test(rel)) { res.writeHead(403); res.end('403'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('404 ' + rel); }
}).listen(PORT, () => console.log('xross-forge on http://localhost:' + PORT));
