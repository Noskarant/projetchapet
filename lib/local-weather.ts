export type LocalWeather = { temperature: number; symbol: string; time: string };

export type WeatherSlot = LocalWeather & {
  hours: number; windKmh: number | null; rainMm: number | null;
  minimum: number | null; maximum: number | null;
};
export type WeatherForecast = LocalWeather & { slots: WeatherSlot[] };
export type WeatherDaySlot = WeatherSlot & { fromTime: string; toTime: string; rainEstimated: boolean };
export type WeatherDay = {
  date: string; slots: WeatherDaySlot[]; minimum: number | null; maximum: number | null;
  symbol: string; rainMm: number | null; rainEstimated: boolean; windKmh: number | null;
};

type Period = { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number; air_temperature_min?: number; air_temperature_max?: number } };
type Entry = { time?: string; data?: { instant?: { details?: { air_temperature?: number; wind_speed?: number } }; next_1_hours?: Period; next_6_hours?: Period; next_12_hours?: Period } };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hour = 3600_000;

export function readWeatherForecast(raw: unknown, now = Date.now()): WeatherForecast | null {
  const current = readLocalWeather(raw, now);
  if (!current) return null;
  const data = raw as { properties?: { timeseries?: Entry[] } };
  const entries = (Array.isArray(data?.properties?.timeseries) ? data.properties.timeseries : [])
    .filter(entry => entry.time && Number.isFinite(Date.parse(entry.time)) && finite(entry.data?.instant?.details?.air_temperature))
    .sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
  const slots: WeatherSlot[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index], time = Date.parse(entry.time!);
    if (time < now - hour || time > now + 8 * 24 * hour || slots.some(slot => slot.time === entry.time)) continue;
    const next = entries[index + 1];
    const gap = next ? (Date.parse(next.time!) - time) / hour : 0;
    // Pick a single non-overlapping accumulation, never add 1h + 6h rainfall.
    const choices: [number, Period | undefined][] = [[1, entry.data?.next_1_hours], [6, entry.data?.next_6_hours], [12, entry.data?.next_12_hours]];
    const [hours, period] = choices.find(([length, value]) => value && length <= gap) || [0, undefined];
    const details = entry.data!.instant!.details!;
    slots.push({ time: entry.time!, temperature: Math.round(details.air_temperature!),
      symbol: period?.summary?.symbol_code || 'cloudy', hours,
      windKmh: finite(details.wind_speed) && details.wind_speed >= 0 ? Math.round(details.wind_speed * 3.6) : null,
      rainMm: finite(period?.details?.precipitation_amount) && period!.details!.precipitation_amount! >= 0 ? period!.details!.precipitation_amount! : null,
      minimum: finite(period?.details?.air_temperature_min) ? Math.round(period!.details!.air_temperature_min!) : null,
      maximum: finite(period?.details?.air_temperature_max) ? Math.round(period!.details!.air_temperature_max!) : null,
    });
  }
  return { ...current, slots };
}

export function weatherDate(time: string | number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export function weatherDays(slots: WeatherSlot[], timeZone: string, now = Date.now()): WeatherDay[] {
  const formatter = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateOf = (time: number) => { const parts = formatter.formatToParts(new Date(time)); return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-'); };
  const today = dateOf(now);
  const days: WeatherDay[] = Array.from({ length: 7 }, (_, index) => ({
    date: new Date(Date.parse(`${today}T12:00:00Z`) + index * 24 * hour).toISOString().slice(0, 10),
    slots: [], minimum: null, maximum: null, symbol: 'cloudy', rainMm: null, rainEstimated: false, windKmh: null,
  }));
  for (const slot of slots) {
    const start = Date.parse(slot.time), end = start + slot.hours * hour;
    if (end <= now && start < now) continue;
    const addSlot = (day: WeatherDay, from: number, to: number) => {
      const estimated = from !== start || to !== end;
      const amount = slot.rainMm !== null && slot.hours > 0 ? slot.rainMm * (to - from) / (end - start) : null;
      day.slots.push({ ...slot, fromTime: new Date(from).toISOString(), toTime: new Date(to).toISOString(), rainMm: amount, rainEstimated: estimated });
      day.minimum = Math.min(day.minimum ?? Infinity, slot.temperature, !estimated ? slot.minimum ?? slot.temperature : slot.temperature);
      day.maximum = Math.max(day.maximum ?? -Infinity, slot.temperature, !estimated ? slot.maximum ?? slot.temperature : slot.temperature);
      if (slot.windKmh !== null) day.windKmh = Math.max(day.windKmh ?? 0, slot.windKmh);
      if (amount !== null) day.rainMm = (day.rainMm ?? 0) + amount;
      if (estimated || amount === null) day.rainEstimated = true;
    };
    if (slot.hours <= 0) {
      const day = days.find(item => item.date === dateOf(start));
      if (day) addSlot(day, start, start);
      continue;
    }
    // Attribute crossing-midnight totals by duration; mark these daily estimates.
    // Find the local midnight boundary, including DST days (23/25h).
    for (let cursor = Math.max(start, now); cursor < end;) {
      const date = dateOf(cursor);
      let boundary = end;
      if (dateOf(end - 1) !== date) {
        let low = cursor, high = end;
        while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (dateOf(middle) === date) low = middle; else high = middle; }
        boundary = high;
      }
      const target = days.find(item => item.date === date);
      if (target) addSlot(target, cursor, boundary);
      cursor = boundary;
    }
  }
  const hours = new Intl.DateTimeFormat('en', { timeZone, hour: 'numeric', hourCycle: 'h23' });
  for (const day of days) {
    // Representative daytime condition, rather than always the midnight symbol.
    const noon = day.slots.reduce<WeatherDaySlot | null>((best, slot) => !best || Math.abs(Number(hours.format(new Date(slot.fromTime))) - 12) < Math.abs(Number(hours.format(new Date(best.fromTime))) - 12) ? slot : best, null);
    day.symbol = noon?.symbol || 'cloudy';
    if (day.rainMm !== null) day.rainMm = Math.round(day.rainMm * 10) / 10;
  }
  return days;
}

export function readWeatherPlace(raw: unknown, fallbackZone: string) {
  const data = raw as { city?: unknown; locality?: unknown; localityInfo?: { informative?: { name?: string }[] } };
  const city = [data?.city, data?.locality].find(value => typeof value === 'string' && value.trim()) as string | undefined;
  let timeZone = fallbackZone;
  for (const place of Array.isArray(data?.localityInfo?.informative) ? data.localityInfo.informative : []) {
    const zone = place.name?.match(/[A-Za-z_+-]+\/[A-Za-z_+\-/]+/)?.[0];
    if (!zone) continue;
    try { new Intl.DateTimeFormat('fr', { timeZone: zone }); timeZone = zone; break; } catch { /* Not a timezone. */ }
  }
  return { city: city?.trim() || 'Près de toi', timeZone };
}

export function weatherCoordinates(latitude: string | null, longitude: string | null) {
  if (!latitude?.trim() || !longitude?.trim()) return null;
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: lat.toFixed(2), lon: lon.toFixed(2) };
}

export function readLocalWeather(raw: unknown, now = Date.now()): LocalWeather | null {
  const data = raw as { properties?: { timeseries?: Array<{ time?: string; data?: { instant?: { details?: { air_temperature?: number } }; next_1_hours?: { summary?: { symbol_code?: string } }; next_6_hours?: { summary?: { symbol_code?: string } } } }> } };
  const entries = Array.isArray(data?.properties?.timeseries) ? data.properties.timeseries : [];
  const current = entries.filter(entry => entry.time && Number.isFinite(Date.parse(entry.time)))
    .sort((a, b) => Math.abs(Date.parse(a.time!) - now) - Math.abs(Date.parse(b.time!) - now))[0];
  const temperature = current?.data?.instant?.details?.air_temperature;
  if (!current?.time || typeof temperature !== 'number' || !Number.isFinite(temperature)
    || Math.abs(Date.parse(current.time) - now) > 3 * 60 * 60 * 1000) return null;
  return { temperature: Math.round(temperature), time: current.time,
    symbol: current.data?.next_1_hours?.summary?.symbol_code || current.data?.next_6_hours?.summary?.symbol_code || 'cloudy' };
}
