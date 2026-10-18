import { formatMoney } from '@tiendasaas/commerce-core';
import type { ComponentProps, ReactNode } from 'react';

export function Money({ cents, currency = 'ARS' }: { cents: number; currency?: string }) {
  return <span>{formatMoney(cents, currency)}</span>;
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mb-4 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm"
    >
      {children}
    </p>
  );
}

export function Field({
  label,
  name,
  className = '',
  ...props
}: { label: string; name: string } & ComponentProps<'input'>) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium">{label}</span>
      <input
        id={name}
        name={name}
        className="w-full rounded border border-neutral-400 px-3 py-2 text-base"
        {...props}
      />
    </label>
  );
}

export function PrimaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400 ${className}`}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`rounded border border-neutral-400 px-3 py-2 text-sm hover:bg-neutral-100 ${className}`}
    />
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      {children}
    </section>
  );
}
