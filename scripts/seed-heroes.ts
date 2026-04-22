// One-time script: fetches heroes from OpenDota and writes shared/heroes.json
// Run with: npx tsx scripts/seed-heroes.ts
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CDN_BASE = 'https://cdn.cloudflare.steamstatic.com'

interface OdotaHero {
  id: number
  name: string            // "npc_dota_hero_antimage"
  localized_name: string  // "Anti-Mage"
  img?: string            // "/apps/dota2/images/dota_react/heroes/antimage.png?" (may be absent)
}

interface HeroEntry {
  name: string
  portrait: string
}

/**
 * Derive portrait URL from hero data.
 * Prefer the img field if present, otherwise derive from hero name slug.
 * hero.name = "npc_dota_hero_antimage" → slug = "antimage"
 */
function derivePortrait(hero: OdotaHero): string {
  if (hero.img) {
    return CDN_BASE + hero.img.replace('?', '')
  }
  // Derive slug from internal name: strip "npc_dota_hero_" prefix
  const slug = hero.name.replace('npc_dota_hero_', '')
  return `${CDN_BASE}/apps/dota2/images/dota_react/heroes/${slug}.png`
}

async function seedHeroes() {
  console.log('Fetching heroes from OpenDota...')
  const res = await fetch('https://api.opendota.com/api/heroes')
  if (!res.ok) throw new Error(`OpenDota /heroes failed: ${res.status} ${res.statusText}`)
  const heroes: OdotaHero[] = await res.json() as OdotaHero[]

  const heroMap: Record<number, HeroEntry> = {}
  for (const hero of heroes) {
    heroMap[hero.id] = {
      name: hero.localized_name,
      portrait: derivePortrait(hero),
    }
  }

  const outPath = join(__dirname, '../shared/heroes.json')
  writeFileSync(outPath, JSON.stringify(heroMap, null, 2) + '\n')
  console.log(`Seeded ${heroes.length} heroes to shared/heroes.json`)
}

seedHeroes().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
