'use client';

import {useEffect, useRef, useState} from 'react';
import {fetchWorkspace} from '@/lib/project-chapet';
import {normalizedWorkspaceToMobile} from '@/lib/mobile-desktop-sync';
import {EMPTY_MOBILE_WORKSPACE} from '@/lib/mobile-fresh-start';
import {MOBILE_WORKSPACE_STORAGE_KEY} from '@/lib/mobile-workspace-storage';
import {normalizeMobileWorkspace} from '@/lib/mobile-workspace-storage';
import {loadCustomerPortals, saveCustomerPortal} from '@/lib/customer-portal-cloud';
import {clientPortalUrl, resolveCustomerPortal, type CustomerPortalContext, type CustomerPortalLinks} from '@/lib/customer-portals';
import {buildBusinessDocumentPdf, documentFileName, isMobileQuote, type MobileBusinessDocument} from '@/lib/mobile-document-pdf';
import {customerDisplayName} from '@/lib/mobile-prototype';
import {readQuoteInternalMeta} from '@/lib/mobile-quote-preview';
import {loadPrivateQuoteMeta} from '@/lib/quote-private-cloud';
import {flushMobileWorkspace} from '@/lib/mobile-workspace-flush';
import './mobile-client-portal.css';

export type ClientPortalTarget = {customerId?: string; kind?: 'quote' | 'invoice'; number?: string};
type Portal = CustomerPortalContext & {customerId: string; customerName: string; document?: MobileBusinessDocument; links: CustomerPortalLinks};

function localWorkspace() {
  try {return normalizeMobileWorkspace(JSON.parse(window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY) || '{}'), EMPTY_MOBILE_WORKSPACE);}
  catch {return EMPTY_MOBILE_WORKSPACE;}
}

export default function MobileClientPortal() {
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [url, setUrl] = useState('');
  const [scope, setScope] = useState<'document' | 'customer'>('document');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const epoch = useRef(0);

  function close() {epoch.current++; setOpen(false);}

  useEffect(() => {
    const show = async (event: Event) => {
      const target = (event as CustomEvent<ClientPortalTarget>).detail;
      if (!target || (!target.customerId && !target.number)) return;
      const ticket = ++epoch.current;
      setOpen(true); setPortal(null); setUrl(''); setBusy(true); setMessage('Chargement du portail…');
      try {
        const workspace = normalizedWorkspaceToMobile(await fetchWorkspace(), localWorkspace());
        const document = target.kind && target.number ? (target.kind === 'quote' ? workspace.quotes : workspace.invoices).find(item => item.number === target.number) : undefined;
        if (target.number && !document) throw new Error('Enregistrez d’abord ce document pour y rattacher un portail.');
        const customerId = document?.customerId || target.customerId;
        const customer = workspace.customers.find(item => item.id === customerId);
        if (!customer) throw new Error('Enregistrez d’abord la fiche client.');
        const {links} = await loadCustomerPortals(customer.id);
        const context: CustomerPortalContext = document ? (isMobileQuote(document) ? {quoteId: document.id} : {invoiceId: document.id, quoteId: document.sourceQuoteId}) : {};
        if (ticket !== epoch.current) return;
        setPortal({...context, customerId: customer.id, customerName: customerDisplayName(customer), document, links});
        setScope(document ? 'document' : 'customer');
        setUrl(resolveCustomerPortal(links, context)); setMessage('');
      } catch (error) {if (ticket === epoch.current) setMessage(error instanceof Error ? error.message : 'Le portail est indisponible.');}
      finally {if (ticket === epoch.current) setBusy(false);}
    };
    window.addEventListener('manufeo:open-client-portal', show);
    return () => {epoch.current++; window.removeEventListener('manufeo:open-client-portal', show);};
  }, []);

  async function save() {
    if (!portal || busy) return;
    const ticket = epoch.current;
    setBusy(true); setMessage('Enregistrement…');
    try {
      const links = await saveCustomerPortal(portal.customerId, scope === 'document' ? {quoteId: portal.quoteId, invoiceId: portal.invoiceId} : {}, url);
      if (ticket !== epoch.current) return;
      setPortal(current => current ? {...current, links} : current);
      setUrl(clientPortalUrl(url)); setMessage(url.trim() ? 'Lien enregistré.' : 'Lien retiré.');
    } catch (error) {if (ticket === epoch.current) setMessage(error instanceof Error ? error.message : 'Le lien n’a pas pu être enregistré.');}
    finally {if (ticket === epoch.current) setBusy(false);}
  }

  async function download() {
    if (!portal?.document || busy) return;
    const ticket = epoch.current, original = portal.document;
    setBusy(true); setMessage('Préparation du PDF…');
    try {
      const kind = isMobileQuote(original) ? 'quote' : 'invoice';
      await flushMobileWorkspace({entity: kind, id: original.id});
      const fresh = normalizedWorkspaceToMobile(await fetchWorkspace(), localWorkspace());
      const document = (kind === 'quote' ? fresh.quotes : fresh.invoices).find(item => item.id === original.id);
      if (!document) throw new Error('Ce document n’est plus disponible.');
      if (kind === 'quote') await loadPrivateQuoteMeta(window.localStorage);
      const blob = await buildBusinessDocumentPdf({document, customer: fresh.customers.find(item => item.id === document.customerId) || null, company: {}, quoteMeta: kind === 'quote' ? readQuoteInternalMeta(window.localStorage, document.number) : undefined});
      if (ticket !== epoch.current) return;
      const blobUrl = URL.createObjectURL(blob), anchor = window.document.createElement('a');
      anchor.href = blobUrl; anchor.download = documentFileName(document); window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      setMessage('PDF prêt. Ouvrez le portail du client pour y déposer le fichier.');
    } catch (error) {if (ticket === epoch.current) setMessage(error instanceof Error ? error.message : 'Le PDF n’a pas pu être préparé.');}
    finally {if (ticket === epoch.current) setBusy(false);}
  }

  if (!open) return null;
  const validUrl = clientPortalUrl(url);
  return <div className="client-portal-backdrop" onMouseDown={event => {if (event.target === event.currentTarget) close();}}>
    <section className="client-portal-panel" role="dialog" aria-modal="true" aria-labelledby="client-portal-title">
      <header><div><small>{portal?.document?.number || portal?.customerName || 'CLIENT'}</small><h2 id="client-portal-title">Portail du client</h2></div><button type="button" onClick={close} aria-label="Fermer le portail">×</button></header>
      {portal && <>
        <p>Enregistrez le lien reçu par e-mail pour retrouver le portail où déposer vos devis et factures.</p>
        {portal.document && <label>Utiliser ce lien<select value={scope} disabled={busy} onChange={event => {
          const selected = event.target.value as 'document' | 'customer'; setScope(selected);
          setUrl(resolveCustomerPortal(portal.links, selected === 'document' ? portal : {})); setMessage('');
        }}><option value="document">Pour ce dossier</option><option value="customer">Pour tous les dossiers de ce client</option></select></label>}
        <label>Lien du portail<input type="url" value={url} disabled={busy} onChange={event => {setUrl(event.target.value); setMessage('');}} placeholder="https://…" autoComplete="off" spellCheck={false}/></label>
        <small>Le lien reçu par e-mail peut être propre à un dossier.</small>
        <button type="button" disabled={busy || (!!url.trim() && !validUrl)} onClick={() => void save()}>{busy ? 'Patientez…' : url.trim() ? 'Enregistrer le lien' : 'Retirer le lien'}</button>
        <div className="client-portal-actions">
          {portal.document && <button type="button" onClick={() => void download()} disabled={busy}>1. Télécharger {isMobileQuote(portal.document) ? 'le devis' : 'la facture'} PDF</button>}
          {validUrl && <a href={validUrl} target="_blank" rel="noopener noreferrer">{portal.document ? '2. ' : ''}Ouvrir le portail du client ↗</a>}
        </div>
        <p>Déposez ensuite le PDF sur le site du client. Le dépôt reste manuel.</p>
      </>}
      {message && <p role="status">{message}</p>}
    </section>
  </div>;
}
