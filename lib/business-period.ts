import type { CompanyProfile } from './company-profile';
import type { MobileInvoice } from './mobile-prototype';
export type BusinessPeriod = 'exercise' | 'month' | 'rolling3' | 'rolling6' | 'custom';
const iso = (date: Date) => date.toISOString().slice(0, 10);
function anniversary(date: Date, year: number) {
  const day = date.getUTCDate();
  const last = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, date.getUTCMonth(), Math.min(day, last)));
}
export function businessPeriod(profile: CompanyProfile, today = new Date()) {
  const current = new Date(`${iso(today)}T00:00:00Z`);
  const mode = profile.dashboardPeriod || 'exercise';
  let from = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
  let to = current;
  if (mode === 'exercise') {
    const [month, day] = profile.accountingStart.split('-').map(Number);
    from = new Date(Date.UTC(current.getUTCFullYear(), month - 1, day));
    if (from > current) from = new Date(Date.UTC(current.getUTCFullYear() - 1, month - 1, day));
  } else if (mode === 'rolling3' || mode === 'rolling6') {
    const months = mode === 'rolling3' ? 3 : 6;
    const desiredMonth = current.getUTCMonth() - months;
    const lastDay = new Date(Date.UTC(current.getUTCFullYear(), desiredMonth + 1, 0)).getUTCDate();
    from = new Date(Date.UTC(current.getUTCFullYear(), desiredMonth, Math.min(current.getUTCDate(), lastDay)));
    from.setUTCDate(from.getUTCDate() + 1);
  } else if (mode === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(profile.dashboardFrom || '') && /^\d{4}-\d{2}-\d{2}$/.test(profile.dashboardTo || '')) {
    const first = new Date(`${profile.dashboardFrom}T00:00:00Z`), last = new Date(`${profile.dashboardTo}T00:00:00Z`);
    if (Number.isFinite(first.getTime()) && Number.isFinite(last.getTime()) && first <= last) { from = first; to = last; }
  }
  return { from: iso(from), to: iso(to), previousFrom: iso(anniversary(from, from.getUTCFullYear() - 1)), previousTo: iso(anniversary(to, to.getUTCFullYear() - 1)) };
}
export function businessIndicators(invoices: MobileInvoice[], profile: CompanyProfile, today = new Date()) {
  const period = businessPeriod(profile, today);
  const sum = (from: string, to: string) => invoices.filter(item => item.status !== 'Brouillon' && item.issueDate >= from && item.issueDate <= to).reduce((total, item) => total + item.subtotal, 0);
  const revenue = sum(period.from, period.to), previous = sum(period.previousFrom, period.previousTo);
  return { ...period, revenue, previous, evolution: previous > 0 ? Math.round((revenue / previous - 1) * 1000) / 10 : null };
}
