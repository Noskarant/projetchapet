"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { seedMobileWorkspace, type MobileWorkspace } from "@/lib/mobile-prototype";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";
import { supabase } from "@/lib/supabase";

type ProviderStatus = {
  loading: boolean;
  configured: boolean;
  connected: boolean;
  company: { id?: string | null; number?: string | null; name?: string | null } | null;
  verificationStatus: string | null;
  error: string;
};

const EMPTY_PROVIDER_STATUS: ProviderStatus = {
  loading: false,
  configured: false,
  connected: false,
  company: null,
  verificationStatus: null,
  error: "",
};

function readWorkspace(): MobileWorkspace {
  try {
    const value = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
    if (value) return JSON.parse(value) as MobileWorkspace;
  } catch {
    // Le seed reste disponible pour la démonstration.
  }
  return seedMobileWorkspace();
}

function rowStyle(ok: boolean): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "34px 1fr",
    gap: 10,
    alignItems: "start",
    padding: "12px 0",
    borderBottom: "1px solid rgba(255,255,255,.1)",
    color: "#fff",
    opacity: ok ? 1 : 0.88,
  };
}

async function authenticatedRequest(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Connectez-vous à MANUFEO pour gérer la plateforme agréée.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

export default function MobileElectronicInvoicingReadiness() {
  const [open, setOpen] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(EMPTY_PROVIDER_STATUS);
  const [connecting, setConnecting] = useState(false);

  const loadProviderStatus = useCallback(async () => {
    setProviderStatus((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await authenticatedRequest("/api/einvoice/superpdp/status");
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(body.error ?? "État SUPER PDP indisponible."));
      setProviderStatus({
        loading: false,
        configured: Boolean(body.configured),
        connected: Boolean(body.connected),
        company: body.company && typeof body.company === "object"
          ? body.company as ProviderStatus["company"]
          : null,
        verificationStatus: typeof body.verificationStatus === "string" ? body.verificationStatus : null,
        error: "",
      });
    } catch (error) {
      setProviderStatus({
        ...EMPTY_PROVIDER_STATUS,
        error: error instanceof Error ? error.message : "État SUPER PDP indisponible.",
      });
    }
  }, []);

  useEffect(() => {
    const enhance = () => {
      const drawers = Array.from(document.querySelectorAll(".rm-side-drawer"));
      for (const drawer of drawers) {
        const title = drawer.querySelector("header strong")?.textContent || "";
        if (!/comptabilit/i.test(title)) continue;
        const content = drawer.querySelector(".rm-drawer-content");
        if (!content || content.querySelector("[data-einvoice-readiness]")) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.einvoiceReadiness = "true";
        button.textContent = "Ouvrir le centre de préparation";
        button.setAttribute("aria-label", "Ouvrir le centre de facturation électronique");
        Object.assign(button.style, {
          width: "100%",
          minHeight: "52px",
          marginTop: "12px",
          borderRadius: "15px",
          border: "1px solid rgba(62, 111, 210, .45)",
          background: "linear-gradient(135deg, #153e83, #3f5ec7)",
          color: "white",
          fontWeight: "800",
          padding: "12px 14px",
        });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setWorkspaceVersion((value) => value + 1);
          setOpen(true);
        });
        content.append(button);
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadProviderStatus();
  }, [open, loadProviderStatus]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("einvoice");
    if (result !== "connected" && result !== "error") return;
    setOpen(true);
    url.searchParams.delete("einvoice");
    url.searchParams.delete("provider");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const readiness = useMemo(() => {
    if (typeof window === "undefined") return [];
    const workspace = readWorkspace();
    const professionalCustomers = workspace.customers.filter((customer) => customer.kind === "Professionnel");
    const customerRecordsReady = professionalCustomers.length > 0 && professionalCustomers.every((customer) => Boolean(customer.siret && customer.address && customer.postalCode && customer.city));
    const invoicesReady = workspace.invoices.length > 0 && workspace.invoices.every((invoice) => Boolean(invoice.number && invoice.issueDate && invoice.dueDate && invoice.customerId && invoice.items.length && invoice.items.every((line) => line.label && Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice) && Number.isFinite(line.taxRate))));
    return [
      {
        ok: true,
        title: "Plateforme agréée",
        detail: "SUPER PDP retenue : API REST/OpenAPI, Factur-X, UBL, CII, réception, émission, annuaire, cycle de vie et e-reporting.",
      },
      {
        ok: customerRecordsReady,
        title: "Fiches clients professionnels",
        detail: customerRecordsReady ? "SIRET et adresses présents sur les clients professionnels de démonstration." : "Compléter SIRET et adresse de chaque client professionnel.",
      },
      {
        ok: invoicesReady,
        title: "Données structurées des factures",
        detail: invoicesReady ? "Numéro, dates, lignes, montants et TVA sont disponibles sous forme structurée." : "Certaines factures doivent encore être complétées.",
      },
      {
        ok: providerStatus.configured,
        title: "Connecteur API MANUFEO",
        detail: providerStatus.configured
          ? "OAuth, stockage chiffré des jetons et routes émission/réception SUPER PDP sont configurés côté serveur."
          : "Le connecteur est intégré au code. Il reste à renseigner les identifiants OAuth SUPER PDP et les secrets serveur sur Vercel.",
      },
      {
        ok: providerStatus.connected,
        title: "Entreprise reliée à SUPER PDP",
        detail: providerStatus.connected
          ? `${providerStatus.company?.name || "Entreprise"} est reliée à la plateforme agréée${providerStatus.verificationStatus ? ` · statut ${providerStatus.verificationStatus}` : ""}.`
          : "L’administrateur doit autoriser une fois l’entreprise via le parcours OAuth/KYB SUPER PDP.",
      },
      {
        ok: providerStatus.connected,
        title: "E-reporting et statuts de cycle de vie",
        detail: providerStatus.connected
          ? "La plateforme prend en charge ces flux ; MANUFEO peut synchroniser les échanges via l’API après validation des scénarios sandbox."
          : "Disponibles dans SUPER PDP dès que l’entreprise est connectée. Aucun flux réglementaire n’est simulé par MANUFEO.",
      },
    ];
  }, [workspaceVersion, providerStatus]);

  const connectProvider = async () => {
    setConnecting(true);
    setProviderStatus((current) => ({ ...current, error: "" }));
    try {
      const response = await authenticatedRequest("/api/einvoice/superpdp/connect", { method: "POST" });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || typeof body.authorizationUrl !== "string") {
        throw new Error(String(body.error ?? "Connexion SUPER PDP impossible."));
      }
      window.location.assign(body.authorizationUrl);
    } catch (error) {
      setProviderStatus((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Connexion SUPER PDP impossible.",
      }));
      setConnecting(false);
    }
  };

  if (!open) return null;
  const completed = readiness.filter((item) => item.ok).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Centre de facturation électronique"
      data-testid="einvoice-readiness-modal"
      style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(1,8,22,.76)", backdropFilter: "blur(10px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <section style={{ width: "min(100%,760px)", maxHeight: "92dvh", overflowY: "auto", borderRadius: "30px 30px 0 0", background: "linear-gradient(155deg,#06152f,#163f84)", color: "white", padding: 24, boxSizing: "border-box", boxShadow: "0 -24px 70px rgba(0,0,0,.4)" }}>
        <header style={{ display: "grid", gridTemplateColumns: "48px 1fr 48px", alignItems: "center", gap: 10 }}>
          <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ width: 46, height: 46, border: 0, borderRadius: "50%", background: "rgba(255,255,255,.1)", color: "white", fontSize: 27 }}>×</button>
          <div style={{ textAlign: "center" }}><small style={{ color: "#a9badc", fontWeight: 800, letterSpacing: ".14em" }}>CONFORMITÉ FRANCE</small><h2 style={{ margin: "5px 0 0" }}>Facturation électronique</h2></div>
          <span />
        </header>

        <div style={{ marginTop: 20, padding: 17, borderRadius: 18, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)" }}>
          <small style={{ color: "#a9badc", fontWeight: 800 }}>ÉTAT DE PRÉPARATION</small>
          <strong style={{ display: "block", marginTop: 7, fontSize: 25 }}>{completed}/{readiness.length} briques prêtes</strong>
          <span style={{ display: "block", marginTop: 5, color: "#d6e3fb" }}>MANUFEO est raccordé techniquement à SUPER PDP. Une entreprise n’émet réellement qu’après connexion OAuth/KYB et validation de ses flux.</span>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <div style={{ padding: 15, borderRadius: 16, background: "rgba(10,23,51,.64)", border: "1px solid rgba(255,255,255,.11)" }}><strong>1er septembre 2026</strong><span style={{ display: "block", marginTop: 5, color: "#d6e3fb" }}>Réception obligatoire pour toutes les entreprises. Émission obligatoire pour les grandes entreprises et ETI.</span></div>
          <div style={{ padding: 15, borderRadius: 16, background: "rgba(10,23,51,.64)", border: "1px solid rgba(255,255,255,.11)" }}><strong>1er septembre 2027</strong><span style={{ display: "block", marginTop: 5, color: "#d6e3fb" }}>Émission électronique et e-reporting obligatoires pour les PME et micro-entreprises.</span></div>
          <div style={{ padding: 15, borderRadius: 16, background: "rgba(10,23,51,.64)", border: "1px solid rgba(255,255,255,.11)" }}><strong>Formats à prévoir</strong><span style={{ display: "block", marginTop: 5, color: "#d6e3fb" }}>Factur-X, UBL et CII, avec échange par une plateforme agréée et suivi des statuts.</span></div>
        </div>

        <div style={{ marginTop: 18, padding: "0 14px", borderRadius: 18, background: "rgba(1,11,31,.55)", border: "1px solid rgba(255,255,255,.12)" }}>
          {readiness.map((item) => <div key={item.title} style={rowStyle(item.ok)}><span aria-hidden="true" style={{ width: 27, height: 27, borderRadius: "50%", display: "grid", placeItems: "center", background: item.ok ? "#2aa66a" : "#d28b2b", fontWeight: 900 }}>{item.ok ? "✓" : "!"}</span><div><strong>{item.title}</strong><span style={{ display: "block", marginTop: 4, color: "#cad8ef", lineHeight: 1.4 }}>{item.detail}</span></div></div>)}
        </div>

        <div style={{ marginTop: 16, padding: 15, borderRadius: 16, background: "rgba(32,113,78,.2)", border: "1px solid rgba(81,205,148,.35)" }}>
          <strong>SUPER PDP · intégration éditeur</strong>
          <span style={{ display: "block", marginTop: 5, color: "#d8f5e8", lineHeight: 1.45 }}>Plateforme Agréée, API REST/OpenAPI et API AFNOR XP Z12-013. Tarif API public : 0,01 € HT par facture jusqu’à 10 000 factures/mois, puis dégressif. Vérification KYC/KYB : 2 € HT.</span>
        </div>

        {providerStatus.error ? <p role="status" style={{ margin: "14px 0 0", padding: 12, borderRadius: 12, background: "rgba(198,67,67,.2)", color: "#ffdede", lineHeight: 1.4 }}>{providerStatus.error}</p> : null}

        {providerStatus.configured && !providerStatus.connected ? (
          <button
            onClick={() => void connectProvider()}
            disabled={connecting || providerStatus.loading}
            style={{ width: "100%", minHeight: 54, marginTop: 18, border: 0, borderRadius: 16, background: "#0875F5", color: "white", fontWeight: 900, fontSize: 16 }}
          >
            {connecting ? "Ouverture de SUPER PDP…" : "Connecter mon entreprise à SUPER PDP"}
          </button>
        ) : null}

        {providerStatus.connected ? (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: "rgba(42,166,106,.18)", border: "1px solid rgba(81,205,148,.35)" }}>
            <strong>Connexion réglementaire active</strong>
            <span style={{ display: "block", marginTop: 4, color: "#d8f5e8" }}>{providerStatus.company?.name || "Votre entreprise"} est reliée à SUPER PDP. Les émissions restent déclenchées explicitement depuis MANUFEO.</span>
          </div>
        ) : null}

        <button onClick={() => setOpen(false)} style={{ width: "100%", minHeight: 54, marginTop: 18, border: 0, borderRadius: 16, background: "white", color: "#10244a", fontWeight: 900, fontSize: 16 }}>Fermer</button>
        <p style={{ color: "#9eb1d3", fontSize: 12, lineHeight: 1.45, marginBottom: 0 }}>{providerStatus.connected ? "Une transmission réglementaire réelle n’est effectuée qu’après une action d’envoi explicite et validation du fichier par SUPER PDP." : "Aucun envoi réglementaire réel n’est effectué tant que l’entreprise n’est pas connectée et vérifiée auprès de SUPER PDP."}</p>
      </section>
    </div>
  );
}
