import { Space, Tag, Tooltip } from 'antd'
import type { ChangeEvent } from './api'
import { MISSING_LABEL, TYPE_COLOR, TYPE_LABEL } from './format'

export function TypeTag({ change }: { change: ChangeEvent }) {
  return <Tag color={TYPE_COLOR[change.type]}>{TYPE_LABEL[change.type]}</Tag>
}

export function ComplianceTags({ change }: { change: ChangeEvent }) {
  if (change.missingMetadata.length === 0) {
    return <Tag color="success">Follows guidelines</Tag>
  }
  return (
    <Space size={4} wrap>
      {change.missingMetadata.map((m) => (
        <Tooltip key={m} title="Required by the change guidelines">
          <Tag color="warning">{MISSING_LABEL[m] ?? m}</Tag>
        </Tooltip>
      ))}
    </Space>
  )
}
