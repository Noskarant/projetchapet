import test from 'node:test';
import assert from 'node:assert/strict';
import { readWeatherForecast, weatherDays, weatherDate, readWeatherPlace, type WeatherSlot } from '../lib/local-weather';
const H = 3600_000;
const at = (time: string, hours = 6, rainMm: number | null = 6): WeatherSlot => ({ time, hours, rainMm, temperature: 12, symbol: 'rain', windKmh: 18, minimum: 10, maximum: 16 });

test('forecast keeps one accumulation per interval and converts wind to km/h', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const raw = { properties: { timeseries: [0, 1, 7].map((index, i) => ({ time: new Date(now + index * H).toISOString(), data: { instant: { details: { air_temperature: 12.6, wind_speed: 5 } }, next_1_hours: i === 0 ? { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 1 } } : undefined, next_6_hours: { summary: { symbol_code: 'cloudy' }, details: { precipitation_amount: 6, air_temperature_min: 10, air_temperature_max: 16 } } } })) } };
  const result = readWeatherForecast(raw, now)!;
  assert.equal(result.temperature, 13); assert.deepEqual(result.slots.map(slot => slot.hours), [1, 6, 0]);
  assert.deepEqual(result.slots.map(slot => slot.rainMm), [1, 6, null]);
  assert.deepEqual(result.slots.map(slot => slot.windKmh), [18, 18, 18]);
  assert.equal(result.slots[1].minimum, 10); assert.equal(result.slots[1].maximum, 16);
});

test('missing rainfall or wind remains unknown instead of displaying zero', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const raw = { properties: { timeseries: [0, 1].map(index => ({ time: new Date(now + index * H).toISOString(), data: { instant: { details: { air_temperature: 14 } }, next_1_hours: { summary: { symbol_code: 'cloudy' } } } })) } };
  const result = readWeatherForecast(raw, now)!;
  assert.equal(result.slots[0].windKmh, null); assert.equal(result.slots[0].rainMm, null);
  const days = weatherDays(result.slots, 'Europe/Paris', now);
  assert.equal(days[0].rainMm, null); assert.equal(days[0].windKmh, null);
});

test('local dates and seven calendar days respect timezone rather than UTC', () => {
  const now = Date.parse('2026-10-05T23:00:00Z');
  assert.equal(weatherDate(now, 'Europe/Paris'), '2026-10-06');
  const slots = Array.from({ length: 30 }, (_, index) => at(new Date(now + index * 6 * H).toISOString()));
  const days = weatherDays(slots, 'Europe/Paris', now);
  assert.equal(days.length, 7); assert.equal(days[0].date, '2026-10-06'); assert.equal(days[6].date, '2026-10-12');
  assert.ok(days.every(day => day.slots.length > 0));
});

test('rain crossing local midnight is apportioned and labelled as an estimate', () => {
  const now = Date.parse('2026-10-05T18:00:00Z');
  const days = weatherDays([at('2026-10-05T18:00:00Z')], 'Europe/Paris', now);
  assert.equal(days[0].rainMm, 4); assert.equal(days[1].rainMm, 2);
  assert.equal(days[0].rainEstimated, true); assert.equal(days[1].rainEstimated, true);
  assert.equal(days[1].slots.length, 1);
  assert.equal(days[1].slots[0].fromTime, '2026-10-05T22:00:00.000Z');
  assert.equal(days[1].slots[0].toTime, '2026-10-06T00:00:00.000Z');
  assert.equal(days[1].slots[0].rainMm, 2);
  // Period extremes cannot be attributed to either day when they cross midnight.
  assert.equal(days[0].minimum, 12); assert.equal(days[0].maximum, 12);
});

test('six-hour days use the symbol closest to local noon instead of a night icon', () => {
  const now = Date.parse('2026-10-05T00:00:00Z');
  const slots = [at('2026-10-05T00:00:00Z'), { ...at('2026-10-05T12:00:00Z'), symbol: 'clearsky_day' }];
  assert.equal(weatherDays(slots, 'Europe/Paris', now)[0].symbol, 'clearsky_day');
});

test('rain allocation handles a DST transition without assuming 24 hour days', () => {
  const now = Date.parse('2026-10-24T18:00:00Z');
  const days = weatherDays([at('2026-10-24T18:00:00Z'), at('2026-10-25T18:00:00Z')], 'Europe/Paris', now);
  assert.equal(days[0].rainMm, 4); assert.equal(days[1].rainMm, 7); assert.equal(days[2].rainMm, 1);
  assert.equal(days.reduce((sum, day) => sum + (day.rainMm || 0), 0), 12);
});

test('remaining rain excludes the elapsed part of a period and expired slots', () => {
  const now = Date.parse('2026-10-05T15:00:00Z');
  const days = weatherDays([at('2026-10-05T06:00:00Z'), at('2026-10-05T12:00:00Z')], 'UTC', now);
  assert.equal(days[0].rainMm, 3); assert.equal(days[0].slots.length, 1); assert.equal(days[0].rainEstimated, true);
});

test('city name and timezone are validated, with safe unavailable fallbacks', () => {
  assert.deepEqual(readWeatherPlace({ city: ' Oullins ', localityInfo: { informative: [{ name: 'Bogus/Timezone' }, { name: 'Europe/Paris Timezone' }] } }, 'UTC'), { city: 'Oullins', timeZone: 'Europe/Paris' });
  assert.deepEqual(readWeatherPlace({ city: '', locality: 'Petit village' }, 'Europe/Paris'), { city: 'Petit village', timeZone: 'Europe/Paris' });
  assert.deepEqual(readWeatherPlace(null, 'UTC'), { city: 'Près de toi', timeZone: 'UTC' });
});
