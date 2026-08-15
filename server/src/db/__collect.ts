// Temporary: collect a few unfiltered ticks so the scrubber has a real multi-minute
// match to render before TI starts. Deleted after verification.
process.env.TRACKED_LEAGUE_IDS = ''
const { runOnce } = await import('../services/ingest/ingestJob.js')
for (let i = 0; i < 11; i++) {
  const r = await runOnce()
  console.log(new Date().toISOString(), 'tick', i, JSON.stringify(r))
  if (i < 10) await new Promise((res) => setTimeout(res, 30_000))
}
process.exit(0)
