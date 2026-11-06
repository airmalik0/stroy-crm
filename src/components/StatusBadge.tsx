import { Badge } from '@mantine/core'
import { STATUS_COLORS, STATUS_LABELS, type TaskStatus } from '../lib/status'

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light" style={{ flexShrink: 0 }}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
