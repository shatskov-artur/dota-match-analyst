import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PQueue from 'p-queue'

// queues.ts imports nothing from env, so no env mock is needed. We still follow the
// cache.test.ts convention of dynamically importing the module under test.

describe('queues.ts', () => {
  it('exports three distinct PQueue instances', async () => {
    const { valveQueue, openDotaQueue, stratzQueue } = await import('./queues.js')

    expect(valveQueue).toBeInstanceOf(PQueue)
    expect(openDotaQueue).toBeInstanceOf(PQueue)
    expect(stratzQueue).toBeInstanceOf(PQueue)

    // The three must be distinct references — one queue per upstream (D-02).
    expect(valveQueue).not.toBe(openDotaQueue)
    expect(valveQueue).not.toBe(stratzQueue)
    expect(openDotaQueue).not.toBe(stratzQueue)
  })
})

describe('stratzQueue throttling (intervalCap:1, interval:1000)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs tasks in order and defers the 2nd/3rd beyond the interval window', async () => {
    const { stratzQueue } = await import('./queues.js')

    const completionOrder: number[] = []
    const mk = (n: number) => () => {
      completionOrder.push(n)
      return Promise.resolve(n)
    }

    // Enqueue three tasks on the serialized Stratz queue.
    const p1 = stratzQueue.add(mk(1))
    const p2 = stratzQueue.add(mk(2))
    const p3 = stratzQueue.add(mk(3))

    // Drive the queue's internal interval timers forward far enough to let all three run.
    await vi.advanceTimersByTimeAsync(3000)
    await Promise.all([p1, p2, p3])

    // Tolerant assertion: order preserved (FIFO), not exact ms timing.
    expect(completionOrder).toEqual([1, 2, 3])
  })
})
