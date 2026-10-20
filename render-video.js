const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION_SEC = 5;
const RECORD_DIR = path.join(__dirname, '.record-tmp');
const HTML_FILE = path.join(__dirname, 'owl-mecha.html');
const OUTPUT = path.join(__dirname, 'owl-mecha.mp4');

async function main() {
  // Clean up
  if (fs.existsSync(RECORD_DIR)) fs.rmSync(RECORD_DIR, { recursive: true });
  fs.mkdirSync(RECORD_DIR, { recursive: true });

  console.log('Phase 1: Launching browser...');
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: {
      dir: RECORD_DIR,
      size: { width: WIDTH, height: HEIGHT },
    },
  });

  const page = await context.newPage();
  const tWebmStart = Date.now();

  // Phase 2: Freeze animations before page parse
  console.log('Phase 2: Freezing animations...');
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.id = '__freeze';
    style.textContent =
      '*, *::before, *::after { animation-play-state: paused !important;' +
      ' -webkit-animation-play-state: paused !important; }';
    const attach = () => (document.head || document.documentElement).appendChild(style);
    if (document.head || document.documentElement) attach();
    else document.addEventListener('DOMContentLoaded', attach, { once: true });
    window.__unfreeze = () => document.getElementById('__freeze')?.remove();
  });

  // Phase 3: Load page
  console.log('Phase 3: Loading page...');
  await page.goto('file:///' + HTML_FILE.replace(/\\/g, '/'), {
    waitUntil: 'domcontentloaded',
  });

  // Phase 4: Wait for fonts, then unfreeze
  console.log('Phase 4: Waiting for fonts...');
  await page.evaluate(async () => {
    // Wait for stylesheets
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    await Promise.all(
      links.map(
        (link) =>
          new Promise((resolve) => {
            link.addEventListener('load', resolve);
            link.addEventListener('error', resolve);
          })
      )
    );

    // Load all font faces
    for (const face of document.fonts) {
      try { await face.load(); } catch {}
    }

    await document.fonts.ready;

    // Settle layout
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  const leadInMs = Date.now() - tWebmStart;
  console.log(`  Lead-in: ${leadInMs}ms`);

  // Release animations
  await page.evaluate(() => {
    window.__unfreeze?.();
  });

  // Phase 5: Record
  console.log(`Phase 5: Recording ${DURATION_SEC}s...`);
  await page.waitForTimeout(DURATION_SEC * 1000 + 500); // extra 500ms for recorder settle

  // Get video path and close
  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  console.log(`  WebM recorded: ${videoPath}`);

  // Phase 6: Encode with ffmpeg
  console.log('Phase 6: Encoding with ffmpeg...');
  const trimSec = Math.max(0, (leadInMs - 120) / 1000);

  const ffmpegCmd = [
    'ffmpeg -y',
    `-ss ${trimSec.toFixed(3)}`,
    `-i "${videoPath}"`,
    `-t ${DURATION_SEC}`,
    `-r ${FPS}`,
    '-c:v libx264 -pix_fmt yuv420p -preset medium -crf 20',
    '-movflags +faststart',
    `"${OUTPUT}"`,
  ].join(' ');

  console.log(`  Running: ${ffmpegCmd}`);
  try {
    const result = execSync(ffmpegCmd, { encoding: 'utf-8', stdio: 'pipe' });
    console.log('  ffmpeg completed successfully');
  } catch (err) {
    console.error('ffmpeg stderr:', err.stderr);
    throw err;
  }

  // Phase 7: Verify
  console.log('Phase 7: Verifying output...');
  try {
    const probeResult = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUTPUT}"`,
      { encoding: 'utf-8' }
    ).trim();
    const actualDuration = parseFloat(probeResult);
    console.log(`  Duration: ${actualDuration.toFixed(2)}s (expected: ${DURATION_SEC}s)`);

    if (Math.abs(actualDuration - DURATION_SEC) > 1) {
      console.warn('  WARNING: Duration mismatch!');
    }
  } catch (err) {
    console.warn('  ffprobe verification failed:', err.message);
  }

  // Clean up
  fs.rmSync(RECORD_DIR, { recursive: true, force: true });
  console.log(`\nDone! Output: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
