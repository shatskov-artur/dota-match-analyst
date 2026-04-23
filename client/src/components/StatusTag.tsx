import clsx from 'clsx'

type Status = 'Draft' | 'Live' | 'Post-game' | 'Unknown'

interface StatusTagProps {
  status: Status
}

const colorMap: Record<Status, string> = {
  Draft: 'bg-yellow-400/15 text-yellow-400',
  Live: 'bg-green-400/15 text-green-400',
  'Post-game': 'bg-red-400/15 text-red-400',
  Unknown: 'bg-gray-700/40 text-gray-400',
}

export default function StatusTag({ status }: StatusTagProps) {
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-1 text-xs font-normal',
        colorMap[status],
      )}
    >
      {status}
    </span>
  )
}
