/**
 * verify-demo.mjs — drives the built demo in headless Chrome and proves the claims we make
 * about it: no outbound requests, no console errors, and real data on screen.
 *
 * Automated rather than eyeballed in DevTools so the check is repeatable and can be re-run
 * after any change to the demo build.
 *
 * Usage:
 *   node scripts/verify-demo.mjs --url=http://localhost:4173/
 *   node scripts/verify-demo.mjs --url=http://localhost:4173/ --shots --matchId=8932722908
 *
 * Exit code is non-zero if any external request was made or any console error was logged.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const flag = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const has = (n) => process.argv.includes(`--${n}`)

const URL_UNDER_TEST = flag('url')
const MATCH_ID = flag('matchId')
const TAKE_SHOTS = has('shots')
const PORT = Number(flag('port') ?? 9222)
const SHOT_DIR = join(REPO_ROOT, 'docs', 'screenshots')

if (!URL_UNDER_TEST) throw new Error('--url is required')

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge binary found')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Minimal CDP client over the WebSocket built into Node ────────────────────

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const listeners = []

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) {
      for (const l of listeners) l(msg)
    }
  })

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  return {
    ready,
    on: (fn) => listeners.push(fn),
    send(method, params = {}, sessionId) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      })
    },
    close: () => ws.close(),
  }
}

// ─── Launch ───────────────────────────────────────────────────────────────────

const userDataDir = join(tmpdir(), `dota-demo-verify-${Date.now()}`)
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1600,1200',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
// Only ever kill the instance this script started, by its own pid — never a blanket
// taskkill on chrome.exe, which would take the user's own browser down with it.
const cleanup = () => {
  try {
    chrome.kill()
  } catch {
    /* already gone */
  }
}
process.on('exit', cleanup)

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint never came up')
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const requests = []
const consoleErrors = []
const failures = []

const browserWs = await waitForDevtools()
const cdp = connect(browserWs)
await cdp.ready

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

cdp.on((msg) => {
  if (msg.sessionId !== sessionId) return
  if (msg.method === 'Network.requestWillBeSent') {
    requests.push({ url: msg.params.request.url, type: msg.params.type })
  }
  if (msg.method === 'Network.loadingFailed') {
    failures.push({ url: '(see requests)', error: msg.params.errorText })
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '?').join(' '))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    consoleErrors.push(d.exception?.description ?? d.text ?? 'exception')
  }
})

await cdp.send('Network.enable', {}, sessionId)
await cdp.send('Page.enable', {}, sessionId)
await cdp.send('Runtime.enable', {}, sessionId)

async function goto(url, settleMs = 6000) {
  await cdp.send('Page.navigate', { url }, sessionId)
  await sleep(settleMs)
}

/**
 * Stops the replay before screenshotting. Without this the driver keeps ticking during the
 * settle wait, and scrubbing to the final slice wrapped straight back to the start — the
 * "endgame" shot came out showing minute one.
 */
async function pauseReplay() {
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Pause')
        if (btn) btn.click()
        return !!btn
      })()`,
      returnByValue: true,
    },
    sessionId,
  )
}

/**
 * Drags the banner's replay scrubber to `n` so screenshots can be taken at a chosen point in
 * the recording rather than at slice 0, where most matches have barely started.
 *
 * Sets the value through the native setter before dispatching, because React tracks the
 * previous value on the DOM node and ignores an input event whose value it thinks is unchanged.
 */
async function scrubTo(n) {
  const { result } = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const el = document.querySelector('input[type=range][aria-label="Replay position"]')
        if (!el) return 'no scrubber'
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, String(${n}))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        return 'ok ' + el.value
      })()`,
      returnByValue: true,
    },
    sessionId,
  )
  return result.value
}

async function shot(name) {
  if (!TAKE_SHOTS) return
  mkdirSync(SHOT_DIR, { recursive: true })
  const { data } = await cdp.send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: true },
    sessionId,
  )
  writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'))
  console.log(`  screenshot → docs/screenshots/${name}.png`)
}

async function textSample() {
  const { result } = await cdp.send(
    'Runtime.evaluate',
    { expression: 'document.body.innerText.slice(0, 600)', returnByValue: true },
    sessionId,
  )
  return result.value ?? ''
}

const SLICE = flag('slice') ? Number(flag('slice')) : null
const base = URL_UNDER_TEST.replace(/#.*$/, '').replace(/\/$/, '')

/**
 * Extra screenshots, as repeatable --shot=<matchId|home>:<slice>:<name> flags.
 *
 * Each is scrubbed to an explicit slice rather than being timed off the replay: the driver
 * wraps to the start after the last slice, so "wait N seconds and shoot" silently produced a
 * shot of slice 2 when it was meant to show the endgame.
 */
const EXTRA_SHOTS = process.argv
  .filter((a) => a.startsWith('--shot='))
  .map((a) => {
    const [target, slice, name] = a.slice(7).split(':')
    return { target, slice: Number(slice), name }
  })

console.log(`[verify] ${URL_UNDER_TEST}`)
await goto(URL_UNDER_TEST, 8000)
if (SLICE !== null) {
  await pauseReplay()
  console.log(`  scrub → slice ${SLICE}: ${await scrubTo(SLICE)}`)
  await sleep(3000)
}
console.log('--- home page text sample ---')
console.log(await textSample())
await shot('01-home-live-matches')

if (MATCH_ID) {
  await goto(`${base}/#/match/${MATCH_ID}`, 9000)
  if (SLICE !== null) {
    await pauseReplay()
    console.log(`  scrub → slice ${SLICE}: ${await scrubTo(SLICE)}`)
    await sleep(3500)
  }
  console.log(`--- match ${MATCH_ID} text sample ---`)
  console.log(await textSample())
  await shot('02-match-overview')
}

for (const s of EXTRA_SHOTS) {
  const url = s.target === 'home' ? `${base}/#/` : `${base}/#/match/${s.target}`
  await goto(url, 9000)
  await pauseReplay()
  console.log(`  scrub → slice ${s.slice}: ${await scrubTo(s.slice)}`)
  await sleep(3500)
  await shot(s.name)
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

/**
 * Valve's public asset CDN serves the hero/item/ability art and is the same host the live app
 * uses. It takes no API key and consumes no quota, so it is allowed — but it is reported
 * separately rather than filtered out silently, because the disclosure banner makes a claim
 * about it and that claim has to stay checkable.
 */
const ALLOWED_ASSET_HOSTS = ['cdn.cloudflare.steamstatic.com', 'cdn.steamstatic.com']

const pageOrigin = new URL(URL_UNDER_TEST.replace(/#.*$/, '')).origin
const offOrigin = requests.filter((r) => {
  if (r.url.startsWith('data:') || r.url.startsWith('blob:')) return false
  if (r.url.startsWith('file://')) return false
  try {
    return new URL(r.url).origin !== pageOrigin
  } catch {
    return true
  }
})
const assetCdn = offOrigin.filter((r) => {
  try {
    return ALLOWED_ASSET_HOSTS.includes(new URL(r.url).hostname)
  } catch {
    return false
  }
})
// Anything off-origin that is not the art CDN — this is what must be zero.
const external = offOrigin.filter((r) => !assetCdn.includes(r))

const assetHosts = [...new Set(assetCdn.map((r) => new URL(r.url).hostname))]

console.log('\n─── verdict ───')
console.log(`total requests observed : ${requests.length}`)
console.log(`same-origin (own build) : ${requests.length - offOrigin.length}`)
console.log(
  `Valve art CDN (allowed) : ${assetCdn.length}` +
    (assetHosts.length ? `  [${assetHosts.join(', ')}]` : ''),
)
console.log(`API / other external    : ${external.length}   <- must be 0`)
for (const r of external) console.log(`   !! ${r.url}`)
console.log(`console errors          : ${consoleErrors.length}`)
for (const e of consoleErrors) console.log(`   !! ${e.slice(0, 300)}`)
console.log(`failed loads            : ${failures.length}`)
for (const f of failures) console.log(`   !! ${f.error}`)

cdp.close()
cleanup()

const ok = external.length === 0 && consoleErrors.length === 0
console.log(ok ? '\nPASS — no external requests, no console errors' : '\nFAIL — see above')
process.exit(ok ? 0 : 1)
