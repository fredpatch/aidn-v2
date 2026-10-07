import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';

/** Escape a value for interpolation into an HTML template (text or attribute). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** ANAC logo as a data URI (Puppeteer renders with setContent, no base URL). */
export async function logoDataUri(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), 'assets', 'logo.png'),
    path.resolve(process.cwd(), 'apps/api/assets', 'logo.png'),
  ];

  for (const filePath of candidates) {
    try {
      const buffer = await fs.readFile(filePath);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
      // Try the next known runtime layout.
    }
  }

  return null;
}

/** Render a self-contained HTML page to an A4 PDF. One browser per call:
 *  same model as the certificate renderer (low volume, no shared state). */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}
