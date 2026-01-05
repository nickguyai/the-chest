import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ hoverable = false, className = '', children, ...props }, ref) => {
    const cardClass = hoverable ? 'card' : 'card-static'

    return (
      <div ref={ref} className={`${cardClass} ${className}`} {...props}>
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

type CardHeaderProps = HTMLAttributes<HTMLDivElement>

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={className}
        style={{ marginBottom: 'var(--space-4)' }}
        {...props}
      >
        {children}
      </div>
    )
  }
)

CardHeader.displayName = 'CardHeader'

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4'
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ as: Component = 'h2', className = '', children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={`text-lg font-semibold ${className}`}
        {...props}
      >
        {children}
      </Component>
    )
  }
)

CardTitle.displayName = 'CardTitle'

type CardContentProps = HTMLAttributes<HTMLDivElement>

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div ref={ref} className={className} {...props}>
        {children}
      </div>
    )
  }
)

CardContent.displayName = 'CardContent'
