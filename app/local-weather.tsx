'use client';

import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Loader2, Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalWeather as Weather } from '@/lib/local-weather';

let cached: { weather: Weather; expires: number } | null = null;

function weatherAppearance(symbol: string) {
  if (/thunder/.test(symbol)) return { Icon: CloudLightning, label: 'Orages' };
  if (/snow|sleet/.test(symbol)) return { Icon: CloudSnow, label: 'Neige ou neige mêlée' };
  if (/rain/.test(symbol)) return { Icon: CloudRain, label: 'Pluie' };
  if (/fog/.test(symbol)) return { Icon: CloudFog, label: 'Brouillard' };
  if (/clearsky/.test(symbol)) return { Icon: symbol.endsWith('_night') ? Moon : Sun, label: 'Ciel dégagé' };
  if (/fair|partlycloudy/.test(symbol)) return { Icon: CloudSun, label: 'Éclaircies' };
  return { Icon: Cloud, label: 'Nuageux' };
}

export default function LocalWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const locating = useRef(false);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setMessage('La localisation n’est pas disponible dans ce navigateur.'); return; }
    if (locating.current) return;
    locating.current = true; setBusy(true); setMessage('');
    navigator.geolocation.getCurrentPosition(position => {
      if (!mounted.current) return;
      const controller = new AbortController(); request.current?.abort(); request.current = controller;
      const query = new URLSearchParams({ lat: position.coords.latitude.toFixed(2), lon: position.coords.longitude.toFixed(2) });
      void fetch(`/api/weather?${query}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('Météo momentanément indisponible. Réessayez.');
        const result = await response.json() as Weather;
        if (typeof result.temperature !== 'number' || !Number.isFinite(result.temperature) || typeof result.symbol !== 'string') throw new Error('Météo indisponible.');
        if (!mounted.current) return;
        cached = { weather: result, expires: Date.now() + 15 * 60 * 1000 }; setWeather(result);
      }).catch(error => {
        if (mounted.current && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Météo indisponible.');
      }).finally(() => { locating.current = false; if (mounted.current) setBusy(false); });
    }, error => {
      locating.current = false;
      if (!mounted.current) return;
      setBusy(false); setWeather(null); cached = null;
      setMessage(error.code === 1 ? 'Autorise la localisation dans ton navigateur pour afficher la météo.' : 'Localisation indisponible. Réessayez.');
    }, { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 });
  }, []);

  useEffect(() => {
    mounted.current = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const permission = await navigator.permissions?.query({ name: 'geolocation' });
        if (!mounted.current) return;
        if (permission?.state === 'granted') {
          if (cached && cached.expires > Date.now()) setWeather(cached.weather);
          else { setWeather(null); locate(); }
        }
      } catch { /* Safari can require an explicit tap to activate location. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15 * 60 * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => { mounted.current = false; request.current?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [locate]);

  const { Icon, label } = weather ? weatherAppearance(weather.symbol) : { Icon: CloudSun, label: 'Météo locale' };
  return <div className="rm-local-weather">
    <button type="button" className="rm-weather-button" aria-expanded={open} aria-label={weather ? `Météo locale : ${label}, ${weather.temperature} degrés` : 'Activer la météo locale'}
      onClick={() => { setOpen(!open); if (!weather && !busy) locate(); }}>
      {busy ? <Loader2 size={18} className="ava-spin" /> : <Icon size={19} />}{weather && <span>{weather.temperature}°</span>}
    </button>
    {open && <div className="rm-weather-detail" role="status">
      <strong>{weather ? `${label} · ${weather.temperature} °C` : 'Météo locale'}</strong>
      <span>{message || (busy ? 'Recherche de la météo…' : weather ? `Prévision près de toi · ${new Date(weather.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Active la localisation pour afficher la météo près de toi.')}</span>
      {message && <button type="button" onClick={locate} disabled={busy}>Réessayer</button>}
      <a href="https://www.met.no/en" target="_blank" rel="noreferrer">Météo : MET Norway · CC BY 4.0</a>
    </div>}
  </div>;
}
