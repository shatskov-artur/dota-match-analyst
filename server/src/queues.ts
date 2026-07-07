import PQueue from 'p-queue'

/**
 * Per-upstream rate-limit queues — a SAFETY ENVELOPE on top of cached() (which already
 * collapses N viewers → 1 upstream call per TTL). intervalCap = max runs per `interval` window;
 * concurrency caps simultaneity. Numbers are conservative starting values, tunable by the owner
 * (RESEARCH §Queue Config Math). Stratz 500/hr is the binding constraint → serialize it.
 */
export const valveQueue    = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 5 })  // Valve 100k/day
export const openDotaQueue = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 2 })  // OpenDota 50k/month
export const stratzQueue   = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 })  // Stratz 500/hr — slowest
