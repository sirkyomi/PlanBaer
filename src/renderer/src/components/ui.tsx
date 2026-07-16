import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'

export function Button({ className, variant = 'primary', size = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'default' | 'small' | 'icon' }) {
  return <button className={cx('button', `button--${variant}`, `button--${size}`, className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cx('card', className)} {...props} /> }

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cx('input', className)} {...props} /> }

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) { return <label className={cx('label', className)} {...props} /> }

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="label">{label}</span>{children}{hint && <span className="field__hint">{hint}</span>}</label>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }) {
  return <span className={cx('badge', `badge--${tone}`)}>{children}</span>
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state__icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-header__actions">{actions}</div>}</header>
}

export function MetricCard({ label, value, detail, icon, tone = 'blue' }: { label: string; value: string; detail: string; icon: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'purple' }) {
  return <Card className="metric-card"><div className={cx('metric-card__icon', `metric-card__icon--${tone}`)}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></Card>
}
