#!/usr/bin/env node
// Copies non-TS assets (template .eta files etc.) into dist so they are available after publish.
const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const DIST_ROOT = path.join(__dirname, '..', 'dist');

/**
 * Walk src tree and copy every .eta file preserving relative path into dist.
 * This removes the need to keep a manual directory allow‑list.
 */
function walkAndCopy(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndCopy(full);
    } else if (entry.isFile() && entry.name.endsWith('.eta')) {
      const rel = path.relative(SRC_ROOT, full);
      const dest = path.join(DIST_ROOT, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(full, dest);
    }
  }
}

walkAndCopy(SRC_ROOT);

