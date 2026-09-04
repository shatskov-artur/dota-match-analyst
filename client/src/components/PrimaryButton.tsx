import type { ReactNode } from 'react'
import { Link, type To } from 'react-router'

/**
 * The app's one filled primary button (UI-SPEC 10.5 D-6 + D-14).
 *
 * The same class string was pasted into three recovery surfaces — the filtered-empty state,
 * the 404 and the route crash — which is exactly the set of places a reader arrives already
 * unable to get what they came for, and exactly the set nobody thinks to check twice.
 *
 * The fill is `--color-primary-strong`, not `--color-primary`: white on the accent violet
 * measures 4.23:1, so the label on the only button on the page was failing AA. `#6D28D9`
 * puts it at 7.10:1 and leaves `--color-primary` doing its real job on borders and rings,
 * where the 3:1 non-text threshold applies. `is-primary-filled` switches the global focus
 * ring to text colour, since a violet ring on a violet fill is not a ring.
 *
 * Two shapes because the three call sites need two: "go somewhere" is a Link, "do
 * something" is a button, and rendering a Link for an action would put a fake href in the
 * status bar and open a reload in a new tab on middle-click.
 */
type PrimaryButtonProps =
  | { children: ReactNode; className?: string; to: To; onClick?: undefined }
  | { children: ReactNode; className?: string; to?: undefined; onClick: () => void }

// D-9 (§6.3): 41px tall as shipped — three pixels short of the phone touch floor.
const BASE =
  'is-primary-filled inline-flex items-center px-5 py-2.5 max-sm:min-h-11 rounded-full bg-primary-strong text-white ' +
  'text-body-lg font-bold cursor-pointer hover:shadow-[0_0_22px_var(--color-primary-soft)] transition-shadow'

export default function PrimaryButton(props: PrimaryButtonProps) {
  const className = props.className ? `${BASE} ${props.className}` : BASE

  if (props.to !== undefined) {
    return (
      <Link to={props.to} className={className}>
        {props.children}
      </Link>
    )
  }

  return (
    <button type="button" onClick={props.onClick} className={className}>
      {props.children}
    </button>
  )
}
