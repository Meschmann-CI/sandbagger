// Builds the iPhone launch screens in public/splash/.
//
//   node scripts/make-splash.mjs
//
// Opened from the home screen, an installed web app shows a blank screen
// until the page paints. iOS will show a picture there instead, but only
// one whose pixel size matches the phone exactly, so there's one file per
// iPhone screen size, each picked by a media query in index.html (the
// <link> tags this prints).
//
// There's no image library on the machine this was built on, so Chrome
// draws them: a forest screen with the app icon in the middle.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const OUT_DIR = join(PUBLIC_DIR, 'splash')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Portrait screen sizes in points, and the pixel ratio for each.
const SCREENS = [
  { w: 375, h: 667, dpr: 2, phones: 'SE 2nd and 3rd gen, 8' },
  { w: 375, h: 812, dpr: 3, phones: '12 mini, 13 mini, 11 Pro, X, XS' },
  { w: 390, h: 844, dpr: 3, phones: '12, 13, 14, 12 Pro, 13 Pro' },
  { w: 393, h: 852, dpr: 3, phones: '14 Pro, 15, 15 Pro, 16' },
  { w: 402, h: 874, dpr: 3, phones: '16 Pro' },
  { w: 414, h: 896, dpr: 2, phones: '11, XR' },
  { w: 414, h: 896, dpr: 3, phones: '11 Pro Max, XS Max' },
  { w: 428, h: 926, dpr: 3, phones: '12 Pro Max, 13 Pro Max, 14 Plus' },
  { w: 430, h: 932, dpr: 3, phones: '14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus' },
  { w: 440, h: 956, dpr: 3, phones: '16 Pro Max' },
]

const icon = readFileSync(join(PUBLIC_DIR, 'sandbagger-icon-512.png')).toString('base64')

// The icon sits a little above centre, where iOS puts a native app's
// launch artwork, on the forest from the icon itself. The page is laid
// out at the screen's exact size from the top-left corner, because
// headless Chrome won't make a window narrower than about 500px and
// centring in the window put the icon off to the right.
const page = (w, h) => `<!doctype html><html><head><style>
  html, body { margin: 0; background: #1c4632; }
  .screen { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; }
  img { position: absolute; left: ${(w - 128) / 2}px; top: ${Math.round(h * 0.47 - 64)}px;
        width: 128px; height: 128px; border-radius: 30px;
        box-shadow: 0 0 0 6px rgba(239, 227, 200, .12), 0 18px 40px rgba(0, 0, 0, .35); }
</style></head><body><div class="screen"><img src="data:image/png;base64,${icon}" alt=""></div></body></html>`

const work = mkdtempSync(join(tmpdir(), 'sandbagger-splash-'))
mkdirSync(OUT_DIR, { recursive: true })

const links = []
for (const s of SCREENS) {
  const file = `splash-${s.w * s.dpr}x${s.h * s.dpr}.png`
  const htmlPath = join(work, `${file}.html`)
  writeFileSync(htmlPath, page(s.w, s.h))
  execFileSync(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--no-first-run',
    `--user-data-dir=${join(work, 'profile')}`,
    `--window-size=${s.w},${s.h}`,
    `--force-device-scale-factor=${s.dpr}`,
    `--screenshot=${join(OUT_DIR, file)}`,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ])
  console.log('  ', file, `(${s.phones})`)
  links.push(
    `    <link rel="apple-touch-startup-image" href="/splash/${file}" media="(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)" />`,
  )
}

console.log('\nFor index.html:\n')
console.log(links.join('\n'))
