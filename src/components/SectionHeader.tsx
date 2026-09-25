import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { ScriptLabel, SplitHeading } from './SplitHeading'

interface SectionHeaderProps {
  id: string
  label: string
  title: ReactNode
  align?: 'center' | 'left'
  className?: string
  titleClassName?: string
}

export function SectionHeader({ id, label, title, align = 'center', className, titleClassName }: SectionHeaderProps) {
  return (
    <div className={cn(align === 'center' ? 'mx-auto text-center' : 'text-left', className)}>
      <ScriptLabel className={align === 'center' ? 'inline-block' : ''}>{label}</ScriptLabel>
      <SplitHeading id={id} className={cn('heading mt-2', titleClassName)}>
        {title}
      </SplitHeading>
    </div>
  )
}
