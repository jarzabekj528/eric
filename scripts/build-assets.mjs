import { transform } from 'esbuild';
import { readFile, writeFile, readdir, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = new URL('../', import.meta.url);
async function htmlFiles(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name.startsWith('.') || ['node_modules', 'dist', 'booking-landing', 'financing-landing'].includes(item.name)) continue;
    const name = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...await htmlFiles(name));
    else if (name.endsWith('.html')) files.push(name);
  }
  return files;
}
const files = await htmlFiles(root.pathname);
files.push(new URL('_headers', root).pathname);
for (const ext of ['css', 'js']) {
  const source = await readFile(new URL(`assets/site.${ext}`, root), 'utf8');
  const { code } = await transform(source, { loader: ext, minify: true, target: 'es2020' });
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const asset = `site.${hash}.${ext}`;
  await writeFile(new URL(`assets/${asset}`, root), code);
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replace(new RegExp(`site\\.[a-f0-9]{12}\\.${ext}`, 'g'), asset));
  }
  // Retain prior hashed assets so open tabs and cached HTML continue to work.
  console.log(`Built /assets/${asset}`);
}

// Cloudflare Pages build output: public files only. Pages Functions stay at /functions.
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', '404.html', 'thank-you.html', 'robots.txt', 'sitemap.xml', '_headers', 'site.webmanifest', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png', 'favicon-dark.png', 'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png', 'logo.jpg', 'images', 'fonts', 'services', 'service-areas', 'projects', 'contact', 'estimate']) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
await mkdir(new URL('assets/', output));
for (const name of await readdir(new URL('assets/', root))) {
  if (/^site\.[a-f0-9]{12}\.(css|js)$/.test(name)) await cp(new URL('assets/' + name, root), new URL('assets/' + name, output));
}
console.log('Prepared dist/ for Cloudflare Pages; keep root functions/api/lead.js as the Pages Function.');
