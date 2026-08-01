"use client";

import { useEffect, useMemo, useState } from "react";
import { customerDisplayName, seedMobileWorkspace, type MobileWorkspace } from "@/lib/mobile-prototype";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";

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

export default function MobileElectronicInvoicingReadiness() {
  const [open, setOpen] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

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

  const readiness = useMemo(() => {
    if (typeof window === "undefined") return [];
    const workspace = readWorkspace();
    const professionalCustomers = workspace.customers.filter((customer) => customer.kind === "Professionnel");
    const customerRecordsReady = professionalCustomers.length > 0 && professionalCustomers.every((customer) => Boolean(customer.siret && customer.address && customer.postalCode && customer.city));
    const invoicesReady = workspace.invoices.length > 0 && workspace.invoices.every((invoice) => Boolean(invoice.number && invoice.issueDate && invoice.dueDate && invoice.customerId && invoice.items.length && invoice.items.every((line) => line.label && Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice) && Number.isFinite(line.taxRate))));
    return [
      { ok: true, title: "Réception électronique", detail: "Architecture prévue pour recevoir les factures via une plateforme agréée." },
      { ok: customerRecordsReady, title: "Fiches clients professionnels", detail: customerRecordsReady ? "SIRET et adresses présents sur les clients professionnels de démonstration." : "Compléter SIRET et adresse de chaque client professionnel." },
      { ok: invoicesReady, title: "Données structurées des factures", detail: invoicesReady ? "Numéro, dates, lignes, montants et TVA sont disponibles sous forme structurée." : "Certaines factures doivent encore être complétées." },
      { ok: false, title: "Plateforme agréée", detail: "Prestataire à sélectionner puis connecter par API avant la commercialisation." },
      { ok: false, title: "E-reporting et statuts de cycle de vie", detail: "Connecteurs de transmission, rejet, encaissement et suivi à brancher avec la plateforme choisie." },
    ];
  }, [workspaceVersion]);

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
          <span style={{ display: "block", marginTop: 5, color: "#d6e3fb" }}>Le logiciel est préparé au niveau des données. La connexion réelle à une plateforme agréée reste volontairement différée.</span>
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
          <strong>Architecture recommandée</strong>
          <span style={{ display: "block", marginTop: 5, color: "#d8f5e8", lineHeight: 1.45 }}>Conserver le logiciel comme interface métier, puis connecter une plateforme agréée par API pour l’émission, la réception, l’annuaire, le e-reporting et les statuts de cycle de vie.</span>
        </div>

        <button onClick={() => setOpen(false)} style={{ width: "100%", minHeight: 54, marginTop: 18, border: 0, borderRadius: 16, background: "white", color: "#10244a", fontWeight: 900, fontSize: 16 }}>Fermer</button>
        <p style={{ color: "#9eb1d3", fontSize: 12, lineHeight: 1.45, marginBottom: 0 }}>Démonstration de préparation technique : aucun envoi réglementaire réel n’est effectué tant qu’une plateforme agréée n’est pas connectée.</p>
      </section>
    </div>
  );
}
