"use client";
import { useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { buildBusinessDocumentPdf } from '@/lib/mobile-document-pdf';
import { blobToBase64 } from '@/lib/document-tools';
import { readQuoteInternalMeta, parseMobileWorkspace } from '@/lib/mobile-quote-preview';
import { getActiveOrganizationId } from '@/lib/project-chapet';
import { artisanRequest } from '@/lib/artisan-records';
import { smsHref } from '@/lib/document-sms';

export default function DocumentSmsShare() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRef(0);
  useEffect(() => {
    const share = async (event: Event) => {
      const { number, kind = 'quote' } = (event as CustomEvent<{ number: string; kind?: 'quote' | 'invoice' }>).detail || {};
      if (!number) return;
      const current = ++run.current;
      setOpen(true); setBusy(true); setError(''); setMessage(''); setPhone('');
      try {
        const workspace = parseMobileWorkspace(localStorage.getItem('projetchapet-mobile-workspace-v3'));
        const document = (kind === 'quote' ? workspace?.quotes : workspace?.invoices)?.find(item => item.number === number);
        if (!document) throw new Error('Document introuvable. Ouvrez-le à nouveau.');
        const customer = workspace?.customers.find(item => item.id === document.customerId);
        const blob = await buildBusinessDocumentPdf({ document, customer: customer || null, company: {}, quoteMeta: readQuoteInternalMeta(localStorage, number) });
        if (run.current !== current) return;
        const organizationId = await getActiveOrganizationId();
        const result = await artisanRequest('/api/documents/share', { organizationId, number, kind, content: await blobToBase64(blob) });
        if (run.current !== current) return;
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
  return <div className="rm-modal-backdrop" style={{ zIndex: 10020 }}><section className="rm-create-sheet rm-v2-email" role="dialog" aria-modal="true" aria-label="Partager par SMS">
    <header><button aria-label="Fermer le partage SMS" onClick={() => { run.current++; setOpen(false); }}><X size={20}/></button><h2>Partager par SMS</h2><span/></header>
    <div className="rm-form-stack">
      {busy ? <p role="status">Préparation du lien PDF…</p> : error ? <p role="alert">{error}</p> : <>
        <label>Téléphone du client<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
        <label>Message<textarea aria-label="Message SMS" value={message} onChange={event => setMessage(event.target.value)} rows={5}/></label>
        <p>Le lien PDF est valable 7 jours. Vous confirmez l’envoi dans Messages. Sur ordinateur, vous pouvez copier le message.</p>
      </>}
    </div>
    <footer><button className="rm-outline-button" onClick={() => { run.current++; setOpen(false); }}>Fermer</button>{!busy && !error && <a className="rm-save-button" style={{display:'inline-flex',alignItems:'center',gap:8,textDecoration:'none'}} href={smsHref(phone, message, apple)}><MessageSquare size={18}/>Ouvrir Messages</a>}</footer>
  </section></div>;
}
