#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const version = require('../package.json').version;
const distDir = path.join(__dirname, '..', 'dist');
const standaloneDir = path.join(__dirname, '..', '.next', 'standalone');

// Clean and create dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy standalone build
console.log('Copying standalone build...');
fs.cpSync(standaloneDir, path.join(distDir, 'beads-ui'), { recursive: true });

// Copy static files
console.log('Copying static files...');
fs.cpSync(
  path.join(__dirname, '..', '.next', 'static'),
  path.join(distDir, 'beads-ui', '.next', 'static'),
  { recursive: true }
);

// Copy public folder
console.log('Copying public folder...');
fs.cpSync(
  path.join(__dirname, '..', 'public'),
  path.join(distDir, 'beads-ui', 'public'),
  { recursive: true }
);

// Create launcher script
console.log('Creating launcher script...');
const launcherScript = `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=\${PORT:-3000}
HOST=\${HOST:-localhost}

cd "$SCRIPT_DIR"
exec node server.js
`;

fs.writeFileSync(path.join(distDir, 'beads-ui', 'beads-ui'), launcherScript, { mode: 0o755 });

// Create tarball
console.log('Creating tarball...');
const tarballName = `beads-ui-${version}-standalone.tar.gz`;
execSync(`tar -czf ${tarballName} beads-ui`, { cwd: distDir });

console.log(`\nRelease package created: dist/${tarballName}`);

// Calculate SHA256
const sha256 = execSync(`shasum -a 256 dist/${tarballName}`).toString().split(' ')[0];
console.log(`SHA256: ${sha256}`);
