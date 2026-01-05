import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const baseClass = 'btn'
    const variantClass = `btn-${variant}`
    const sizeStyles = {
      sm: { padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--font-size-sm)' },
      md: { padding: 'var(--space-3) var(--space-6)', fontSize: 'var(--font-size-base)' },
      lg: { padding: 'var(--space-4) var(--space-8)', fontSize: 'var(--font-size-md)' },
    }

    return (
      <button
        ref={ref}
        className={`${baseClass} ${variantClass} ${className}`}
        style={sizeStyles[size]}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
