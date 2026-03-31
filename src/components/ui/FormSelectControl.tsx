import { ChangeEvent, SelectHTMLAttributes } from 'react'

type Option = {
  label: string
  value: string
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  onChange?: (value: string | null) => void
  options: Array<Option>
  emptyLabel?: string
  value?: string | null
}

const FormSelectControl = ({ value, onChange, options, emptyLabel, style, ...props }: Props) => {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value
    onChange?.(nextValue.length > 0 ? nextValue : null)
  }

  return (
    <select
      {...props}
      onChange={handleChange}
      value={value ?? ''}
      style={{
        backgroundColor: 'var(--rs-input-bg)',
        border: '1px solid var(--rs-border-primary)',
        borderRadius: '6px',
        color: 'var(--rs-text-primary)',
        minHeight: '36px',
        padding: '0 12px',
        width: '100%',
        ...style
      }}
    >
      {emptyLabel ? <option value="">{emptyLabel}</option> : null}
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export default FormSelectControl
