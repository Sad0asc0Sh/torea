const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'راهنما.txt');
const scriptPath = path.join(repoRoot, 'scripts', 'guide.sh');

test('guide script generates راهنما.txt with key sections', () => {
  try {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    execFileSync('bash', [scriptPath], { cwd: repoRoot, stdio: 'pipe' });

    const content = fs.readFileSync(outputPath, 'utf8');
    assert.ok(content.includes('ToInfinity GUIDE (راهنما)'), 'guide header missing');
    assert.ok(content.includes('PATH & DISK'), 'path section missing');
    assert.ok(content.includes('PM2 & HEALTHZ'), 'pm2/health section missing');
    assert.ok(content.includes('PROJECT STRUCTURE'), 'structure section missing');
    assert.ok(content.includes('SERVER FILES'), 'server files section missing');
    assert.ok(content.includes('ROUTES & GUARDS QUICK SCAN'), 'routes/guards section missing');
    assert.ok(content.includes('DB CHECK'), 'db check section missing');
  } finally {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  }
});
