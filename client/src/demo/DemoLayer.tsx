import DemoBanner from './DemoBanner'
import DemoDriver from './DemoDriver'

/**
 * Everything the demo build adds on top of the normal app, behind a single lazy import.
 *
 * main.tsx pulls this in via `lazy(() => import('./demo/DemoLayer'))` guarded by the
 * compile-time IS_DEMO constant, which is what keeps the snapshot JSON, the replay driver and
 * this banner out of a production bundle entirely.
 */
export default function DemoLayer() {
  return (
    <>
      <DemoDriver />
      <DemoBanner />
    </>
  )
}
