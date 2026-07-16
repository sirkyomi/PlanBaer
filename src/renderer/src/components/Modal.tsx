import * as Dialog from '@radix-ui/react-dialog'
import { X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Button } from './ui'

export function Modal({ open, onOpenChange, title, description, children, footer, width = 'medium' }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; width?: 'small' | 'medium' | 'large' }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal__overlay" />
      <Dialog.Content className={`modal modal--${width}`}>
        <div className="modal__header"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Dialog schließen"><X size={20} /></Button></Dialog.Close></div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
