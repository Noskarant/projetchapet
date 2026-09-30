export type MascotMood = 'idle' | 'hello' | 'listening' | 'thinking' | 'writing' | 'checking' | 'ready';

const genericNames = new Set(['contact','info','admin','administrateur','commercial','bonjour','support','manufeo','office','artisan']);
function firstName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const name = value.trim().replace(/^(?:m\.?|mme|monsieur|madame)\s+/i, '').split(/\s+/)[0] || '';
  return /^[\p{L}][\p{L}'’\-]{0,39}$/u.test(name) && !genericNames.has(name.toLowerCase()) ? name.charAt(0).toLocaleUpperCase('fr') + name.slice(1) : '';
}
export function mascotName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return '';
  const metadata = user.user_metadata ?? {};
  for (const key of ['first_name','given_name','full_name','name']) {
    const name = firstName(metadata[key]);
    if (name) return name;
  }
  // A recognizable email first name is a fallback, never the company name.
  return firstName(user.email?.split('@')[0]?.split(/[._+]/)[0]);
}
export function mascotGreetingKey(userId: string, date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return `manufeo:mascot:greeting:${userId}:${day}`;
}
export function mascotPreparationMood(elapsedMs: number): MascotMood {
  const phase = Math.floor(Math.max(0, elapsedMs) / 2200) % 4;
  return phase === 0 || phase === 2 ? 'thinking' : phase === 1 ? 'writing' : 'checking';
}
export function mascotVoiceLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
}
