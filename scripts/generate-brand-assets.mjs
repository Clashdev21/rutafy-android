/**
 * Genera PNG de marca para launcher, splash y pantallas internas.
 * Uso: node scripts/generate-brand-assets.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const brandDir = join(root, 'assets', 'brand');
const imagesDir = join(root, 'assets', 'images');

const NAVY = '#0F172A';

function hexToRgba(hex, alpha = 1) {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
    alpha,
  };
}

async function renderSvgToPng(svgPath, width, height) {
  return sharp(readFileSync(svgPath))
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function compositeIsotype({
  size,
  iconScale,
  backgroundColor = null,
  outPath,
}) {
  const iconSize = Math.round(size * iconScale);
  const iconBuf = await renderSvgToPng(join(brandDir, 'isotype-mark.svg'), iconSize, iconSize);
  const offset = Math.round((size - iconSize) / 2);

  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: backgroundColor
        ? hexToRgba(backgroundColor)
        : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  await base
    .composite([{ input: iconBuf, left: offset, top: offset }])
    .png()
    .toFile(outPath);
}

async function renderSvgFile(svgPath, width, outPath) {
  await sharp(readFileSync(svgPath))
    .resize(width, null, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPath);
}

async function main() {
  const outputs = [
    ['app-icon.png', () => compositeIsotype({ size: 1024, iconScale: 0.58, backgroundColor: NAVY, outPath: join(imagesDir, 'app-icon.png') })],
    ['icon.png', async () => {
      await compositeIsotype({ size: 1024, iconScale: 0.58, backgroundColor: NAVY, outPath: join(imagesDir, 'icon.png') });
    }],
    ['adaptive-icon.png', () => compositeIsotype({ size: 1024, iconScale: 0.52, backgroundColor: null, outPath: join(imagesDir, 'adaptive-icon.png') })],
    ['android-icon-foreground.png', async () => {
      await compositeIsotype({ size: 1024, iconScale: 0.52, backgroundColor: null, outPath: join(imagesDir, 'android-icon-foreground.png') });
      await compositeIsotype({ size: 1024, iconScale: 0.52, backgroundColor: null, outPath: join(brandDir, 'adaptive-icon-foreground.png') });
    }],
    ['logo-icon.png', () => renderSvgFile(join(brandDir, 'logo-icon.svg'), 512, join(brandDir, 'logo-icon.png'))],
    ['logo-full.png', () => renderSvgFile(join(brandDir, 'logo-full-light.svg'), 480, join(imagesDir, 'logo-full.png'))],
    ['splash-icon.png', () => renderSvgFile(join(brandDir, 'splash-brand.svg'), 320, join(imagesDir, 'splash-icon.png'))],
    ['favicon.png', () => compositeIsotype({ size: 192, iconScale: 0.58, backgroundColor: NAVY, outPath: join(imagesDir, 'favicon.png') })],
    ['brand/splash.png', () => renderSvgFile(join(brandDir, 'splash-brand.svg'), 320, join(brandDir, 'splash.png'))],
  ];

  for (const [name, task] of outputs) {
    await task();
    console.log(`generated ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
