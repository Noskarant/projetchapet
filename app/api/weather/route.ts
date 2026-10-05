import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/api-guard';
import { readWeatherForecast, weatherCoordinates } from '@/lib/local-weather';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const limited = rateLimit(request, 'local-weather', 30);
  if (limited) return limited;
  const query = new URL(request.url).searchParams;
  const coordinates = weatherCoordinates(query.get('lat'), query.get('lon'));
  if (!coordinates) return NextResponse.json({ error: 'Localisation invalide.' }, { status: 400 });
  try {
    const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
    url.searchParams.set('lat', coordinates.lat); url.searchParams.set('lon', coordinates.lon);
    const response = await fetch(url, { headers: { 'User-Agent': 'MANUFEO/1.0 https://github.com/Noskarant/projetchapet' },
      signal: AbortSignal.timeout(8000), next: { revalidate: 1800 } });
    if (!response.ok) throw new Error('Weather unavailable');
    const weather = readWeatherForecast(await response.json());
    if (!weather) throw new Error('Weather unavailable');
    return NextResponse.json(weather);
  } catch {
    return NextResponse.json({ error: 'Météo momentanément indisponible.' }, { status: 503 });
  }
}
