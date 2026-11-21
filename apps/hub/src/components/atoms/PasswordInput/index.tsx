'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { cn } from 'cn'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { ComponentProps, FC, useState } from 'react'

/** Password input with a show/hide toggle. */
const PasswordInput: FC<Omit<ComponentProps<typeof Input>, 'type'>> = ({ className, ...props }) => {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  )
}

export default PasswordInput
