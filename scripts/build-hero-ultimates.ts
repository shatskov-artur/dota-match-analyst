// One-time build script: generates shared/heroUltimates.json from dotaconstants.
// Run with: npx tsx scripts/build-hero-ultimates.ts (or `npm run build:ults`).
//
// Algorithm (per .planning/phases/08-ability-cooldowns-map/08-RESEARCH.md A1):
//   For each hero in shared/heroes.json, look up its abilities array in
//   dotaconstants/build/hero_abilities.json, filter out 'generic_hidden',
//   take the LAST remaining entry — that is the ultimate.
//
// Output shape (mirrors heroes.json id-keyed structure, single string value):
//   { "1": "antimage_mana_void", "2": "axe_culling_blade", ... }
//
// Re-runnable per Dota patch: just rerun and commit the diff.
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import heroes from '../shared/heroes.json' with { type: 'json' }
import { hero_abilities } from 'dotaconstants'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface HeroEntry {
  name: string
  portrait: string
}

interface HeroAbilities {
  abilities: string[]
  talents?: unknown[]
  facets?: Array<{ name?: string }>
}

const heroesMap = heroes as Record<string, HeroEntry>
const abilitiesMap = hero_abilities as Record<string, HeroAbilities>

const out: Record<string, string> = {}
const skipped: Array<{ id: string; reason: string }> = []

for (const [idStr, h] of Object.entries(heroesMap)) {
  const m = h.portrait.match(/heroes\/(.+)\.png/)
  if (!m) {
    skipped.push({ id: idStr, reason: `portrait did not match heroes/<short>.png: ${h.portrait}` })
    continue
  }
  const shortName = m[1]
  const npcKey = `npc_dota_hero_${shortName}`
  const entry = abilitiesMap[npcKey]
  if (!entry || !Array.isArray(entry.abilities)) {
    skipped.push({ id: idStr, reason: `no entry in hero_abilities for ${npcKey}` })
    continue
  }
  // Filter out 'generic_hidden' placeholders AND any aspect/facet ability names
  // (newer dotaconstants append facet abilities after the real ultimate — see RESEARCH.md A1).
  const facetNames = new Set((entry.facets ?? []).map((f) => f?.name).filter((n): n is string => !!n))
  const ult = [...entry.abilities]
    .reverse()
    .find((a) => a && a !== 'generic_hidden' && !facetNames.has(a))
  if (!ult) {
    skipped.push({ id: idStr, reason: `no non-generic_hidden ability for ${npcKey}` })
    continue
  }
  out[idStr] = ult
}

// Sort numeric keys ascending (1, 2, 3, ... 10, 11, ...).
const sorted: Record<string, string> = {}
const sortedKeys = Object.keys(out).sort((a, b) => Number(a) - Number(b))
for (const k of sortedKeys) sorted[k] = out[k]

const outPath = join(__dirname, '../shared/heroUltimates.json')
writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n')

console.log(`Wrote ${sortedKeys.length} hero ultimates to shared/heroUltimates.json`)
if (skipped.length > 0) {
  console.error(`Skipped ${skipped.length} heroes:`)
  for (const s of skipped) console.error(`  hero_id=${s.id}: ${s.reason}`)
}
