import { HTMLAttributes, forwardRef } from 'react'

type BadgeVariant = 'sage' | 'success' | 'warning' | 'critical' | 'default'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
      sage: {
        background: 'var(--color-sage-light)',
        color: 'var(--color-sage)',
      },
      success: {
        background: 'rgba(39, 174, 96, 0.1)',
        color: 'var(--color-success)',
      },
      warning: {
        background: 'rgba(243, 156, 18, 0.1)',
        color: 'var(--color-warning)',
      },
      critical: {
        background: 'rgba(231, 76, 60, 0.1)',
        color: 'var(--color-critical)',
      },
      default: {
        background: 'rgba(0, 0, 0, 0.05)',
        color: 'var(--color-text-secondary)',
      },
    }

    return (
      <span
        ref={ref}
        className={`badge ${className}`}
        style={variantStyles[variant]}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

// Status badge helper
interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: 'in_progress' | 'not_started' | 'completed' | 'backlog'
}

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, ...props }, ref) => {
    const statusConfig: Record<string, { variant: BadgeVariant; label: string }> = {
      in_progress: { variant: 'sage', label: 'In Progress' },
      not_started: { variant: 'default', label: 'Not Started' },
      completed: { variant: 'success', label: 'Completed' },
      backlog: { variant: 'warning', label: 'Backlog' },
    }

    const config = statusConfig[status] || statusConfig.not_started

    return (
      <Badge ref={ref} variant={config.variant} {...props}>
        {config.label}
      </Badge>
    )
  }
)

StatusBadge.displayName = 'StatusBadge'
