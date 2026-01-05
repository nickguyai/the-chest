import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-secondary uppercase"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input ${error ? 'input-error' : ''} ${className}`}
          style={error ? { borderColor: 'var(--color-critical)' } : undefined}
          {...props}
        />
        {error && (
          <span className="text-sm" style={{ color: 'var(--color-critical)' }}>
            {error}
          </span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-secondary uppercase"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`input textarea ${error ? 'input-error' : ''} ${className}`}
          style={error ? { borderColor: 'var(--color-critical)' } : undefined}
          {...props}
        />
        {error && (
          <span className="text-sm" style={{ color: 'var(--color-critical)' }}>
            {error}
          </span>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-secondary uppercase"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={`input ${error ? 'input-error' : ''} ${className}`}
          style={error ? { borderColor: 'var(--color-critical)' } : undefined}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <span className="text-sm" style={{ color: 'var(--color-critical)' }}>
            {error}
          </span>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'
