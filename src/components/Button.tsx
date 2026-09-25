import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

type Variant = 'glow' | 'dark'

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant
  children: ReactNode
}

const isExternal = (href?: string) => !!href && /^https?:\/\//.test(href)

export function ButtonLink({ variant = 'dark', className, children, href, ...rest }: ButtonLinkProps) {
  return (
    <a
      href={href}
      className={cn('btn', variant === 'glow' ? 'btn-glow' : 'btn-dark', className)}
      {...(isExternal(href) ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  )
}

interface IconLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant
  label: string
  children: ReactNode
}

export function IconLink({ variant = 'dark', label, className, children, href, ...rest }: IconLinkProps) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className={cn('btn btn-icon', variant === 'glow' ? 'btn-glow' : 'btn-dark', className)}
      {...(isExternal(href) ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  )
}

/** The design always pairs a pill with a round icon button, ~5px apart. */
export function ButtonPair({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-[5px]', className)}>{children}</div>
}
