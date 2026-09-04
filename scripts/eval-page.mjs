/**
 * eval-page.mjs — run an expression inside a page in headless Chrome and print the result.
 *
 * The counterpart to shoot.mjs: that answers "how does it look", this answers "what does
 * the DOM actually say". Useful for checking that an interaction changed what it claims to.
 *
 *   node scripts/eval-page.mjs --url=http://localhost:5173/match/123 --expr="document.title"
 *   node scripts/eval-page.mjs --url=... --file=probe.js --wait=6000
 *
 * The expression may be async. Like verify-demo.mjs, this only kills the Chrome it started.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const flag = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)

const URL_ = flag('url')
const EXPR = flag('file') ? readFileSync(flag('file'), 'utf8') : (flag('expr') ?? 'location.href')
const WAIT = Number(flag('wait') ?? 5000)
const PORT = Number(flag('port') ?? 9225)
if (!URL_) throw new Error('--url is required')

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge binary found')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(tmpdir(), `dota-eval-${process.pid}`)}`,
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

let wsUrl
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
    if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl
  } catch {
    /* not up yet */
  }
  if (!wsUrl) await sleep(250)
}

const ws = new WebSocket(wsUrl)
let nextId = 1
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) p.reject(new Error(JSON.stringify(m.error)))
    else p.resolve(m.result)
  }
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
await send('Page.enable', {}, sessionId)
await send('Runtime.enable', {}, sessionId)
await send('Page.navigate', { url: URL_ }, sessionId)
await sleep(WAIT)

const res = await send(
  'Runtime.evaluate',
  { expression: EXPR, returnByValue: true, awaitPromise: true, userGesture: true },
  sessionId,
)
if (res.exceptionDetails) {
  console.error('EXCEPTION:', res.exceptionDetails.text, res.exceptionDetails.exception?.description ?? '')
  process.exitCode = 1
} else {
  console.log(JSON.stringify(res.result.value ?? res.result, null, 1))
}

ws.close()
chrome.kill()
process.exit(process.exitCode ?? 0)
