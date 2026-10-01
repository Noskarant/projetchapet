"use client";

import { useMemo, useState } from 'react';
import type { MobileQuote } from '@/lib/mobile-prototype';
import { buildQuoteSuggestions, SUGGESTION_GREETING, type PriceHistoryQuote, type QuoteSuggestion } from '@/lib/quote-suggestions';
import ManufeoMascot from './manufeo-mascot';
import './quote-suggestions.css';

export default function QuoteSuggestions({ quote, history = [], onApply }: { quote: MobileQuote; history?: PriceHistoryQuote[]; onApply: (suggestion: QuoteSuggestion, input: { quantity: number; unitPrice: number; taxRate: number; id: string }) => Promise<void> }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [tax, setTax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const suggestions = useMemo(() => buildQuoteSuggestions(quote, history).filter(item => !dismissed.includes(item.id)), [quote, history, dismissed]);
  const suggestion = suggestions[0];
  const existingLine = quote.items.find(item => item.id === suggestion?.lineId);
  if (!suggestion) return null;

  function dismiss() {
    setDismissed(current => [...current, suggestion.id]); setEditing(false); setError('');
  }
  function edit() {
    const line = quote.items.find(item => item.id === suggestion.lineId);
    setQuantity(line?.quantity?.toString() || (suggestion.unit === 'forfait' ? '1' : ''));
    setPrice(suggestion.price?.unitPrice.toString() || '');
    const rates = [...new Set(quote.items.map(item => item.taxRate).filter(rate => rate !== null))];
    setTax(line?.taxRate?.toString() ?? (rates.length === 1 ? String(rates[0]) : ''));
    setEditing(true); setError('');
  }
  async function apply() {
    if (!quantity.trim() || !price.trim() || !tax.trim()) { setError('Complète la quantité, le prix HT et la TVA.'); return; }
    setBusy(true); setError('');
    try {
      await onApply(suggestion, { quantity: Number(quantity.replace(',', '.')), unitPrice: Number(price.replace(',', '.')), taxRate: Number(tax.replace(',', '.')), id: crypto.randomUUID() });
      dismiss();
    } catch (error) { setError(error instanceof Error ? error.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }
  return <section className="quote-suggestions" aria-label="Suggestions MANUFEO">
    <button type="button" className="quote-suggestions-intro" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <ManufeoMascot mood="hello"/><span><strong>{SUGGESTION_GREETING}</strong><small>{suggestion.label} · {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}</small></span><b>{expanded ? 'Fermer' : 'Voir'}</b>
    </button>
    {expanded && <div className="quote-suggestions-content">
      <strong>{suggestion.label}</strong><p>{suggestion.reason}</p>
      <small>Si c’est utile pour ce chantier, tu peux compléter ton devis.</small>
      {editing ? <form onSubmit={event => { event.preventDefault(); void apply(); }}>
        <div className="quote-suggestions-fields"><label>Quantité ({suggestion.unit})<input aria-label="Quantité suggestion" inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} disabled={busy || existingLine?.quantity != null}/></label>
          <label>Prix unitaire HT (€)<input aria-label="Prix suggestion" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} disabled={busy}/></label>
          <label>TVA<select aria-label="TVA suggestion" value={tax} onChange={event => setTax(event.target.value)} disabled={busy || existingLine?.taxRate != null}><option value="">Choisir</option>{[0, 5.5, 10, 20].map(rate => <option value={rate} key={rate}>{rate} %</option>)}</select></label></div>
        {error && <p role="alert">{error}</p>}
        <div className="quote-suggestions-actions"><button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Confirmer l’ajout'}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Annuler</button></div>
      </form> : <div className="quote-suggestions-actions"><button type="button" onClick={edit}>{suggestion.lineId ? 'Utiliser ce tarif' : 'Ajouter'}</button><button type="button" onClick={dismiss}>Déjà compris</button><button type="button" onClick={dismiss}>Ignorer</button></div>}
    </div>}
  </section>;
}
