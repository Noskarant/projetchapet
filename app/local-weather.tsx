'use client';

import { ArrowLeft, ChevronRight, Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Droplets, Info, Loader2, MapPin, Moon, Sun, Wind, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readWeatherPlace, weatherDays, type WeatherForecast, type WeatherDaySlot } from '@/lib/local-weather';

type Place = { city: string; timeZone: string };
let cached: { weather: WeatherForecast; place: Place; expires: number } | null = null;

function weatherAppearance(symbol: string) {
  if (/thunder/.test(symbol)) return { Icon: CloudLightning, label: 'Orages' };
  if (/snow|sleet/.test(symbol)) return { Icon: CloudSnow, label: 'Neige' };
  if (/rain/.test(symbol)) return { Icon: CloudRain, label: 'Pluie' };
  if (/fog/.test(symbol)) return { Icon: CloudFog, label: 'Brouillard' };
  if (/clearsky/.test(symbol)) return { Icon: symbol.endsWith('_night') ? Moon : Sun, label: 'Ciel dégagé' };
  if (/fair|partlycloudy/.test(symbol)) return { Icon: symbol.endsWith('_night') ? CloudMoon : CloudSun, label: 'Éclaircies' };
  return { Icon: Cloud, label: 'Nuageux' };
}
const rain = (value: number | null, estimated = false) => value === null ? '—' : `${estimated ? '≈ ' : ''}${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mm`;
const wind = (value: number | null) => value === null ? '—' : `${value} km/h`;

export default function LocalWeather() {
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [place, setPlace] = useState<Place>({ city: 'Près de toi', timeZone: 'UTC' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'now' | 'week' | 'day'>('now');
  const [selectedDate, setSelectedDate] = useState('');
  const [info, setInfo] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const locating = useRef(false);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setMessage('La localisation n’est pas disponible dans ce navigateur.'); return; }
    if (locating.current) return;
    locating.current = true; setBusy(true); setMessage('');
    navigator.geolocation.getCurrentPosition(position => {
      if (!mounted.current) return;
      const controller = new AbortController(); request.current?.abort(); request.current = controller;
      const cityController = new AbortController();
      const abortCity = () => cityController.abort(); controller.signal.addEventListener('abort', abortCity);
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      const cityTimeout = window.setTimeout(abortCity, 5000);
      const query = new URLSearchParams({ lat: position.coords.latitude.toFixed(2), lon: position.coords.longitude.toFixed(2) });
      const cityQuery = new URLSearchParams({ latitude: position.coords.latitude.toFixed(2), longitude: position.coords.longitude.toFixed(2), localityLanguage: 'fr' });
      const fallback = { city: 'Près de toi', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      // The city lookup runs only on this device's newly obtained, authorised GPS location.
      const cityRequest = fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${cityQuery}`, { signal: cityController.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
        .then(async response => response.ok ? readWeatherPlace(await response.json(), fallback.timeZone) : fallback).catch(() => fallback);
      const weatherRequest = fetch(`/api/weather?${query}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('La météo est momentanément indisponible. Réessaie dans un instant.');
        const result = await response.json() as WeatherForecast;
        if (typeof result.temperature !== 'number' || !Number.isFinite(result.temperature) || typeof result.symbol !== 'string') throw new Error('La météo est momentanément indisponible.');
        return { ...result, slots: Array.isArray(result.slots) ? result.slots : [] };
      });
      void Promise.all([weatherRequest, cityRequest]).then(([result, location]) => {
        if (!mounted.current || controller.signal.aborted) return;
        cached = { weather: result, place: location, expires: Date.now() + 15 * 60 * 1000 };
        setWeather(result); setPlace(location);
      }).catch(() => {
        if (mounted.current && request.current === controller) setMessage('La météo est momentanément indisponible. Réessaie dans un instant.');
      }).finally(() => {
        window.clearTimeout(timeout); window.clearTimeout(cityTimeout); controller.signal.removeEventListener('abort', abortCity);
        cityController.abort(); locating.current = false; if (mounted.current) setBusy(false);
      });
    }, error => {
      locating.current = false;
      if (!mounted.current) return;
      setBusy(false); setWeather(null); cached = null;
      setMessage(error.code === 1 ? 'Autorise la localisation dans ton navigateur pour afficher la météo.' : 'Ta position est momentanément indisponible. Réessaie dans un instant.');
    }, { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 });
  }, []);

  useEffect(() => {
    mounted.current = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const permission = await navigator.permissions?.query({ name: 'geolocation' });
        if (!mounted.current) return;
        if (permission?.state === 'granted') {
          if (cached && cached.expires > Date.now()) { setWeather(cached.weather); setPlace(cached.place); }
          else locate();
        } else if (permission?.state === 'denied') { cached = null; setWeather(null); }
      } catch { /* Safari can require an explicit tap to activate location. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15 * 60 * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => { mounted.current = false; request.current?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [locate]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => { if (open) heading.current?.focus({ preventScroll: true }); }, [open, view]);

  const days = useMemo(() => weatherDays(weather?.slots || [], place.timeZone), [weather, place.timeZone, open]);
  const selected = days.find(day => day.date === selectedDate);
  const tomorrow = days[1];
  const upcoming = (weather?.slots || []).filter(slot => Date.parse(slot.time) + slot.hours * 3600_000 > Date.now()).slice(0, 4);
  const { Icon, label } = weather ? weatherAppearance(weather.symbol) : { Icon: CloudSun, label: 'Météo locale' };
  const time = (value: string) => new Date(value).toLocaleTimeString('fr-FR', { timeZone: place.timeZone, hour: '2-digit', minute: '2-digit' });
  const dayLabel = (date: string) => date === days[0]?.date ? 'Aujourd’hui' : date === days[1]?.date ? 'Demain' : new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric' });
  const slotLabel = (slot: WeatherDaySlot) => slot.hours > 1 ? `${time(slot.fromTime)} – ${time(slot.toTime)}` : Date.parse(slot.time) < Date.now() ? 'En cours' : time(slot.time);
  const range = (min: number | null, max: number | null) => min === null || max === null ? 'Indisponible' : `${min}° / ${max}°`;
  const close = () => { setOpen(false); trigger.current?.focus(); };

  return <div className="rm-local-weather" ref={root}>
    <button ref={trigger} type="button" className="rm-weather-button" aria-expanded={open} aria-haspopup="dialog" aria-label={weather ? `Météo locale : ${label}, ${weather.temperature} degrés` : 'Activer la météo locale'}
      onClick={() => { setOpen(!open); setView('now'); setInfo(false); if (!weather && !busy) locate(); }}>
      {busy && !weather ? <Loader2 size={18} className="ava-spin" /> : <Icon size={19} />}
    </button>
    {open && <section className="rm-weather-detail" role="dialog" aria-label="Météo locale">
      <div className="rm-weather-top">
        {view !== 'now' && <button type="button" className="rm-weather-icon-button" aria-label={view === 'day' ? 'Retour à la semaine' : 'Retour à la météo actuelle'} onClick={() => setView(view === 'day' ? 'week' : 'now')}><ArrowLeft size={20} /></button>}
        <h2 ref={heading} tabIndex={-1}><MapPin size={15} aria-hidden="true" /><span>{place.city}</span></h2>
        <button type="button" className="rm-weather-icon-button" aria-label="Informations météo" aria-expanded={info} onClick={() => setInfo(!info)}><Info size={18} /></button>
        <button type="button" className="rm-weather-icon-button" aria-label="Fermer la météo" onClick={close}><X size={20} /></button>
      </div>
      {message && <div className="rm-weather-message" role="status"><span>{message}</span><button type="button" className="rm-weather-link-button" onClick={locate} disabled={busy}>Réessayer</button></div>}
      {!weather && !message && <p role="status">{busy ? 'Recherche de la météo près de toi…' : 'Active la localisation pour afficher la météo près de toi.'}</p>}
      {weather && view === 'now' && <>
        <div className="rm-weather-current"><Icon size={44} aria-hidden="true" /><div><strong>{weather.temperature}<small> °C</small></strong><span>{label}</span></div><span className="rm-weather-now">Maintenant</span></div>
        {upcoming.length > 0 && <><h3>Les prochaines heures</h3><div className="rm-weather-hours">{upcoming.map(slot => {
          const { Icon: HourIcon, label: hourLabel } = weatherAppearance(slot.symbol);
          return <div className="rm-weather-hour" key={slot.time}><span>{slot.hours > 1 ? `${time(slot.time)} · ${slot.hours} h` : Date.parse(slot.time) < Date.now() ? 'En cours' : time(slot.time)}</span><HourIcon size={23} aria-label={hourLabel} /><strong>{slot.temperature}°</strong><small><Droplets size={12} aria-hidden="true" />{rain(slot.rainMm)}</small><small><Wind size={12} aria-hidden="true" />{wind(slot.windKmh)}</small></div>;
        })}</div></>}
        {tomorrow?.slots.length > 0 && <button type="button" className="rm-weather-tomorrow" onClick={() => { setSelectedDate(tomorrow.date); setView('day'); }}><span><strong>Demain</strong><small>Min. / max.</small></span><strong>{range(tomorrow.minimum, tomorrow.maximum)}</strong><ChevronRight size={18} /></button>}
        <button type="button" className="rm-weather-week-link" onClick={() => setView('week')}>Voir les 7 prochains jours<ChevronRight size={18} /></button>
      </>}
      {weather && view === 'week' && <>
        <h3>Les 7 prochains jours</h3><p className="rm-weather-caption">Appuie sur un jour pour voir les créneaux.</p>
        <div className="rm-weather-days">{days.map(day => { const { Icon: DayIcon, label: dayCondition } = weatherAppearance(day.symbol); return <button type="button" className="rm-weather-day" key={day.date} disabled={!day.slots.length} onClick={() => { setSelectedDate(day.date); setView('day'); }}>
          <span><strong>{dayLabel(day.date)}</strong><small>{day.slots.length ? range(day.minimum, day.maximum) : 'Prévision indisponible'}</small></span>
          <DayIcon size={23} role="img" aria-label={dayCondition} /><span className="rm-weather-day-metrics"><span><Droplets size={13} aria-hidden="true" />{rain(day.rainMm, day.rainEstimated)}</span><span><Wind size={13} aria-hidden="true" />{wind(day.windKmh)}</span></span><ChevronRight size={16} />
        </button>; })}</div><p className="rm-weather-caption">Min. / max. prévues · Aujourd’hui : à partir de maintenant.<br />≈ : pluie estimée sur les créneaux disponibles. — : donnée absente.</p>
      </>}
      {weather && view === 'day' && selected && <>
        <h3>{dayLabel(selected.date)} · {range(selected.minimum, selected.maximum)}</h3>
        <div className="rm-weather-day-summary"><span><Droplets size={15} />{rain(selected.rainMm, selected.rainEstimated)}</span><span><Wind size={15} />{selected.windKmh === null ? 'Vent indisponible' : `Jusqu’à ${wind(selected.windKmh)}`}</span></div>
        <p className="rm-weather-caption">{selected.slots.some(slot => slot.hours > 1) ? 'Prévisions par créneau de 6 h ou plus.' : 'Prévisions heure par heure.'}{selected.date === days[0]?.date ? ' À partir de maintenant.' : ''}</p>
        <div className="rm-weather-slots">{selected.slots.map(slot => { const { Icon: SlotIcon, label: slotCondition } = weatherAppearance(slot.symbol); return <div className="rm-weather-slot" key={slot.time}>
          <span>{slotLabel(slot)}</span><SlotIcon size={20} role="img" aria-label={slotCondition} /><strong>{slot.temperature}°</strong><small><Droplets size={12} />{rain(slot.rainMm, slot.rainEstimated)}</small><small><Wind size={12} />{wind(slot.windKmh)}</small>
        </div>; })}</div>
      </>}
      {info && <div className="rm-weather-source"><p>Prévisions : <a href="https://www.met.no/en" target="_blank" rel="noreferrer">MET Norway</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Affichage simplifié et valeurs arrondies. Les prévisions lointaines sont moins précises.</p><p>Ville : <a href="https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api" target="_blank" rel="noreferrer">BigDataCloud</a>, à partir de ta position autorisée, arrondie au centième de degré.</p>{weather && <p>Mise à jour toutes les 15 minutes · Prévision à {time(weather.time)}.</p>}</div>}
      {weather && !weather.slots.length && view !== 'day' && <p className="rm-weather-caption">Les prévisions détaillées sont momentanément indisponibles.</p>}
    </section>}
  </div>;
}
