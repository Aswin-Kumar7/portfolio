import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../lib/cn'
import { track } from '../lib/analytics'

/** Round glow button that copies the email address, with a quiet confirmation. */
export function CopyEmail({ email, variant = 'glow', label = 'hero' }: { email: string; variant?: 'glow' | 'dark'; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email)
    } catch {
      // clipboard blocked (http / old browser): fall back to a hidden selection
      const input = document.createElement('input')
      input.value = email
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
    track('copy_email', { label })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2200)
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Email copied' : `Copy email address (${email})`}
        title={copied ? 'Copied!' : 'Copy email'}
        className={cn('btn btn-icon', variant === 'glow' ? 'btn-glow' : 'btn-dark')}
      >
        <span className="relative size-[17px]">
          <Copy
            size={17}
            strokeWidth={1.8}
            className={cn('absolute inset-0 transition-[scale,opacity] duration-500', copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100')}
          />
          <Check
            size={17}
            strokeWidth={2}
            className={cn('absolute inset-0 transition-[scale,opacity] duration-500', copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0')}
          />
        </span>
      </button>
      <span
        role="status"
        className={cn(
          'mono-label pointer-events-none absolute top-full left-1/2 mt-3 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1.5 text-[10px] whitespace-nowrap text-white ring-1 ring-white/10 transition-[translate,opacity] duration-500',
          copied ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
        )}
      >
        {copied ? 'Email copied' : ''}
      </span>
    </span>
  )
}
