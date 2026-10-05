export type LocalWeather = { temperature: number; symbol: string; time: string };

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
