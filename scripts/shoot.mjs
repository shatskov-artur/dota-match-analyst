/**
 * shoot.mjs — screenshot one or more app URLs in headless Chrome.
 *
 * A development aid for eyeballing pages that have no snapshot fixtures yet (the v2.0
 * tournament/bracket/scrubber screens). Reuses the CDP plumbing proven by verify-demo.mjs.
 *
 *   node scripts/shoot.mjs --base=http://localhost:5173 --paths=/,/tournament/19719 --out=docs/shots
 *
 * Like verify-demo.mjs, this only ever kills the Chrome it started, by pid.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const flag = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)

const BASE = flag('base') ?? 'http://localhost:5173'
const PATHS = (flag('paths') ?? '/').split(',')
const OUT = join(REPO_ROOT, flag('out') ?? 'docs/shots')
const PORT = Number(flag('port') ?? 9223)
const WAIT_MS = Number(flag('wait') ?? 3500)

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge binary found')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const listeners = []
  ws.addEventListener('message', (ev) => {
    // CDP occasionally delivers a frame this client has no use for (binary, or a
    // truncated giant payload). Dropping it beats crashing the whole run.
    let msg
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))
    } catch {
      return
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) {
      for (const l of listeners) {
        try {
          l(msg)
        } catch (err) {
          console.error('[shoot] listener error on', msg.method, '-', err.message)
        }
      }
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

const userDataDir = join(tmpdir(), `dota-shoot-${Date.now()}`)
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1600,1400',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => {
  try {
    chrome.kill()
  } catch {
    /* already gone */
  }
})

async function devtoolsUrl() {
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

mkdirSync(OUT, { recursive: true })

const client = connect(await devtoolsUrl())
await client.ready

const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })
await client.send('Page.enable', {}, sessionId)
await client.send('Runtime.enable', {}, sessionId)

const consoleErrors = []
client.on((msg) => {
  if (msg.sessionId !== sessionId) return
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    consoleErrors.push((msg.params.args ?? []).map((a) => a?.value ?? a?.description ?? '?').join(' '))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params?.exceptionDetails?.text ?? 'exception')
  }
})

for (const path of PATHS) {
  const url = `${BASE}${path}`
  await client.send('Page.navigate', { url }, sessionId)
  await sleep(WAIT_MS)
  const metrics = await client.send('Page.getLayoutMetrics', {}, sessionId)
  const h = Math.min(Math.ceil(metrics.cssContentSize.height), 6000)
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: h, deviceScaleFactor: 1, mobile: false }, sessionId)
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' }, sessionId)
  const name = (path.replace(/[^a-z0-9]+/gi, '_') || 'root') + '.png'
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  console.log(`shot ${url} → ${join(OUT, name)} (${h}px tall)`)
  await client.send('Emulation.clearDeviceMetricsOverride', {}, sessionId)
}

if (consoleErrors.length) {
  console.log('\nconsole errors:')
  for (const e of [...new Set(consoleErrors)].slice(0, 15)) console.log('  -', e)
} else {
  console.log('\nno console errors')
}

client.close()
chrome.kill()
process.exit(0)
