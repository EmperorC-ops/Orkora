import { COMPANY } from '@/lib/company';

/**
 * The company's statutory line for page footers: registered name and RC
 * number, plus the registered office and directors when switched on in
 * lib/company.ts. One component so the line
 * cannot drift between pages.
 */
export function LegalEntityLine({ className }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-5 text-ink-muted ${className ?? ''}`}>
      {COMPANY.name}, {COMPANY.rcNumber}. Registered in Nigeria.
      {COMPANY.registeredOffice ? ` Registered office: ${COMPANY.registeredOffice}.` : ''}
      {COMPANY.showDirectors ? ` ${COMPANY.directors}.` : ''}
    </p>
  );
}
