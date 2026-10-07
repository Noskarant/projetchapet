"use client";

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { artisanRequest } from '@/lib/artisan-records';

type Workspace = {
  projects: Array<{ id: string; name: string; subtitle: string; address: string; status: string; teamInstructions?: string }>;
  steps: Array<{ id: string; project_id: string; label: string; done: boolean }>;
  photos: Array<{ id: string; project_id: string; caption: string; url: string }>;
};
const emptyWorkspace: Workspace = { projects: [], steps: [], photos: [] };

export default function WorkerWorkspace({ organizationName, accountEmail, onAccount }: {
  organizationName: string;
  accountEmail: string;
  onAccount: () => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadRun = useRef(0);

  async function load() {
    const run = ++loadRun.current;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Votre session a expiré. Reconnectez-vous depuis Mon compte.');
      const response = await fetch('/api/worker-workspace', {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('Votre session a expiré. Reconnectez-vous depuis Mon compte.');
        if (response.status === 403) throw new Error('Ce compte n’a pas accès à cet espace. Vérifiez votre compte ou contactez le responsable de l’entreprise.');
        throw new Error('Chargement des chantiers indisponible. Réessayez dans un instant.');
      }
      const result = await response.json() as Workspace;
      if (run !== loadRun.current) return;
      setWorkspace(result);
      setLoaded(true);
    } catch (error) {
      if (run !== loadRun.current) return;
      setError(error instanceof Error ? error.message : 'Chargement des chantiers indisponible.');
    } finally {
      if (run === loadRun.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { loadRun.current++; };
  }, []);

  async function update(body: object) {
    setBusy(true);
    setError('');
    try {
      await artisanRequest('/api/worker-workspace', body);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sauvegarde impossible.');
    } finally {
      setBusy(false);
    }
  }

  function photo(projectId: string, file: File | null) {
    if (!file) return;
    if (file.size > 4000000) { setError('Utilisez une photo de moins de 4 Mo.'); return; }
    const reader = new FileReader();
    reader.onload = () => void update({ projectId, name: file.name, photo: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return <main className="worker-app">
    <header><strong>MANUFEO · Mon équipe</strong><div className="worker-actions">
      <button type="button" onClick={onAccount}>Mon compte</button>
      <button type="button" disabled={loading || busy} onClick={() => void load()}>Actualiser</button>
    </div></header>
    <section className="worker-account-info">
      <strong>{organizationName}</strong><span>{accountEmail}</span><span>Accès salarié terrain</span>
      <p>Vous êtes dans l’espace de l’équipe chantier. Pour retrouver vos devis et factures, ouvrez Mon compte et connectez-vous avec votre compte de gestion.</p>
    </section>
    <p>Vos chantiers, consignes et photos sont sauvegardés dans votre compte.</p>
    {loading && <p role="status">Chargement de vos chantiers…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={loading || busy} onClick={() => void load()}>Réessayer</button></div>}
    {loaded && !loading && !error && !workspace.projects.length && <p>Aucun chantier affecté. Demandez à votre responsable de vous ajouter à l’équipe du chantier.</p>}
    {workspace.projects.map(project => <section key={project.id}>
      <h2>{project.name}</h2><p>{project.address}</p><p>{project.subtitle}</p><strong>{project.status}</strong>
      {project.teamInstructions && <div aria-label="Consignes de l’équipe"><h3>Consignes de l’équipe</h3><p style={{whiteSpace:'pre-wrap',lineHeight:1.5}}>{project.teamInstructions}</p></div>}
      <div>{workspace.steps.filter(step => step.project_id === project.id).map(step => <label key={step.id}>
        <input type="checkbox" disabled={busy || loading} checked={step.done} onChange={event => void update({ projectId: project.id, stepId: step.id, done: event.target.checked })} />
        {step.label}{step.done ? ' · Terminé' : ''}
      </label>)}</div>
      <div className="worker-photos">{workspace.photos.filter(photo => photo.project_id === project.id).map(photo => <img key={photo.id} src={photo.url} alt={photo.caption} />)}</div>
      <label>Ajouter une photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || loading} onChange={event => photo(project.id, event.target.files?.[0] || null)} /></label>
    </section>)}
    <style>{`.worker-app{max-width:1000px;margin:auto;padding:20px;font-family:Arial;color:#163954;min-height:100dvh;background:#f3f7fa;box-sizing:border-box}.worker-app header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.worker-actions{display:flex;gap:10px;flex-wrap:wrap}.worker-app button{min-height:44px;border:0;border-radius:10px;background:#17674d;color:white;padding:12px;font:inherit;cursor:pointer}.worker-app button:disabled{opacity:.6;cursor:wait}.worker-app section{padding:20px;margin:16px 0;border:1px solid #d8e2eb;border-radius:18px;background:white}.worker-account-info{display:grid;gap:8px;overflow-wrap:anywhere}.worker-account-info p{margin:4px 0;line-height:1.5}.worker-app label{display:flex;gap:10px;align-items:center;padding:10px 0;flex-wrap:wrap}.worker-app input[type=file]{max-width:100%}.worker-photos{display:flex;gap:12px;overflow:auto}.worker-photos img{width:220px;height:180px;object-fit:cover;border-radius:12px}`}</style>
  </main>;
}
