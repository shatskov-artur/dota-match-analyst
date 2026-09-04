import { useLocation } from 'react-router'
import PageShell from '../components/PageShell'
import PrimaryButton from '../components/PrimaryButton'

/**
 * Every URL the router does not recognise.
 *
 * Without this route `<Routes>` matched nothing and rendered nothing, so a mistyped or
 * stale link produced an empty black page — indistinguishable from a crash, and with no
 * navigation left to get out of it.
 *
 * Deliberately NOT lazy-loaded: it is a paragraph and a link, and a wrong URL is the worst
 * moment to spend a round trip before showing anything.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <PageShell eyebrow="404" title="Page not found">
      <div className="bento-card flex flex-col items-start gap-4">
        <p className="text-body text-text-dim">
          Nothing lives at <span className="font-mono text-text-muted">{pathname}</span>. The
          link may be out of date, or a match or tournament that was here is no longer
          published.
        </p>
        <PrimaryButton to="/">Back to live matches</PrimaryButton>
      </div>
    </PageShell>
  )
}
