"use client";
import { useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { buildBusinessDocumentPdf } from '@/lib/mobile-document-pdf';
import { blobToBase64 } from '@/lib/document-tools';
import { readQuoteInternalMeta, parseMobileWorkspace } from '@/lib/mobile-quote-preview';
import { getActiveOrganizationId } from '@/lib/project-chapet';
import { artisanRequest } from '@/lib/artisan-records';
import { smsHref, smsDocumentMessage } from '@/lib/document-sms';

type ShareDetail = { number: string; kind?: 'quote' | 'invoice'; withoutPrices?: boolean };
type PhoneContacts = { select: (properties: string[], options: { multiple: boolean }) => Promise<Array<{ tel?: string[] }>> };

export default function DocumentSmsShare() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [detail, setDetail] = useState<ShareDetail | null>(null);
  const [contactHint, setContactHint] = useState('');
  const run = useRef(0);
  useEffect(() => {
    const share = async (event: Event) => {
      const { number, kind = 'quote', withoutPrices = false } = (event as CustomEvent<ShareDetail>).detail || {};
      if (!number) return;
      const current = ++run.current;
      setDetail({ number, kind, withoutPrices });
      setOpen(true); setBusy(true); setError(''); setMessage(''); setPhone(''); setPdfUrl(''); setContactHint('');
      try {
        const workspace = parseMobileWorkspace(localStorage.getItem('projetchapet-mobile-workspace-v3'));
        const document = (kind === 'quote' ? workspace?.quotes : workspace?.invoices)?.find(item => item.number === number);
        if (!document) throw new Error('Document introuvable. Ouvrez-le à nouveau.');
        const customer = workspace?.customers.find(item => item.id === document.customerId);
        const blob = await buildBusinessDocumentPdf({ document, customer: customer || null, company: {}, quoteMeta: readQuoteInternalMeta(localStorage, number), withoutPrices });
        if (run.current !== current) return;
        const organizationId = await getActiveOrganizationId();
        const result = await artisanRequest('/api/documents/share', { organizationId, number, kind, content: await blobToBase64(blob) });
        if (run.current !== current) return;
        if (typeof result.url !== 'string' || !result.url.startsWith('https://')) throw new Error('Le lien PDF n’a pas pu être préparé. Réessayez.');
        setPdfUrl(result.url);
        setPhone(result.phone || customer?.phones[0] || '');
        setMessage(`Bonjour, voici votre ${kind === 'quote' ? 'devis' : 'facture'} ${number} : ${result.url}`);
      } catch (error) { if (run.current === current) setError(error instanceof Error ? error.message : 'Partage indisponible.'); }
      finally { if (run.current === current) setBusy(false); }
    };
    window.addEventListener('manufeo:share-document-sms', share);
    return () => { run.current++; window.removeEventListener('manufeo:share-document-sms', share); };
  }, []);
  if (!open) return null;
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const contacts = (navigator as Navigator & { contacts?: PhoneContacts }).contacts;
  const finalMessage = pdfUrl ? smsDocumentMessage(message, pdfUrl) : '';
  const selectContact = async () => {
    try {
      const selected = await contacts?.select(['tel'], { multiple: false });
      if (selected?.[0]?.tel?.[0]) setPhone(selected[0].tel[0]);
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setContactHint('Choisissez le contact dans Messages ou saisissez son numéro.'); }
  };
  return <div className="rm-modal-backdrop" style={{ zIndex: 10020 }}><section className="rm-create-sheet rm-v2-email" role="dialog" aria-modal="true" aria-label="Partager par SMS">
    <header><button aria-label="Fermer le partage SMS" onClick={() => { run.current++; setOpen(false); }}><X size={20}/></button><h2>Partager par SMS</h2><span/></header>
    <div className="rm-form-stack">
      {detail && <label>Version du PDF<select aria-label="Version du PDF" value={detail.withoutPrices ? 'without' : 'with'} disabled={busy} onChange={event => window.dispatchEvent(new CustomEvent('manufeo:share-document-sms', { detail: { ...detail, withoutPrices: event.target.value === 'without' } }))}><option value="with">Avec les prix</option><option value="without">Sans les prix</option></select></label>}
      {busy ? <p role="status">Préparation du lien PDF…</p> : error ? <p role="alert">{error}</p> : <>
        <label>Téléphone du client<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
        {contacts ? <button type="button" className="rm-outline-button" onClick={() => void selectContact()}>Choisir un contact du téléphone</button> : <small>Pour choisir un contact du téléphone, ouvrez Messages sans numéro puis sélectionnez le destinataire.</small>}
        {contactHint && <small role="status">{contactHint}</small>}
        <label>Message<textarea aria-label="Message SMS" value={message} onChange={event => setMessage(event.target.value)} rows={5}/></label>
        <small>Le lien du PDF est ajouté automatiquement au message.</small>
        <p>Le lien PDF est valable 7 jours. Vous confirmez l’envoi dans Messages. Sur ordinateur, vous pouvez copier le message.</p>
      </>}
    </div>
    <footer><button className="rm-outline-button" onClick={() => { run.current++; setOpen(false); }}>Fermer</button>{!busy && !error && pdfUrl && <><button type="button" className="rm-outline-button" onClick={() => setPhone('')}>Autre destinataire</button><a className="rm-save-button" style={{display:'inline-flex',alignItems:'center',gap:8,textDecoration:'none'}} href={smsHref(phone, finalMessage, apple)}><MessageSquare size={18}/>Ouvrir Messages</a></>}</footer>
  </section></div>;
}
