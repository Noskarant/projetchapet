"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronRight } from "lucide-react";
import { fetchWorkspace, type Invoice } from "@/lib/project-chapet";

type Period = "3" | "6" | "12" | "all";

function openSection(label: "Devis" | "Factures") {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  button?.click();
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export default function DashboardEnhancements() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [period, setPeriod] = useState<Period>("12");

  const reload = useCallback(async () => {
    try {
      const data = await fetchWorkspace();
      setInvoices(data.invoices);
    } catch {
      // L'application principale affiche déjà les erreurs de chargement.
    }
  }, []);

  useEffect(() => {
    void reload();
    const inspect = () => {
      const content = document.querySelector<HTMLElement>(".pc-content");
      const isDashboard = content?.querySelector("h1")?.textContent?.trim() === "Tableau de bord";
      setTarget(isDashboard ? content : null);

      const actions: Array<{ text: string; section: "Devis" | "Factures" }> = [
        { text: "Facturé ce mois", section: "Factures" },
        { text: "Encaissé ce mois", section: "Factures" },
        { text: "Devis en attente", section: "Devis" },
        { text: "Taux d’acceptation", section: "Devis" },
        { text: "Taux d'acceptation", section: "Devis" },
      ];

      for (const action of actions) {
        const label = Array.from(document.querySelectorAll<HTMLElement>("span, p, small, div")).find(
          (node) => node.childElementCount === 0 && node.textContent?.trim() === action.text,
        );
        const card = label?.closest<HTMLElement>("article, button, .pc-kpi, .pc-stat, .pc-dashboard-card, div");
        if (!card || card.dataset.dashboardLinked === "true") continue;
        card.dataset.dashboardLinked = "true";
        card.classList.add("pc-dashboard-linked-card");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `${action.text} : ouvrir ${action.section.toLowerCase()}`);
        const activate = () => openSection(action.section);
        card.addEventListener("click", activate);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") activate();
        });
      }
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [reload]);

  const series = useMemo(() => {
    const grouped = new Map<string, { billed: number; collected: number }>();
    for (const invoice of invoices) {
      const key = monthKey(invoice.issue_date);
      const current = grouped.get(key) ?? { billed: 0, collected: 0 };
      current.billed += Number(invoice.total || 0);
      current.collected += Number(invoice.paid_total || 0);
      grouped.set(key, current);
    }
    const sorted = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
    const count = period === "all" ? sorted.length : Number(period);
    return sorted.slice(-count).map(([key, values]) => ({ key, label: monthLabel(key), ...values }));
  }, [invoices, period]);

  const max = Math.max(1, ...series.flatMap((item) => [item.billed, item.collected]));
  const totalBilled = series.reduce((sum, item) => sum + item.billed, 0);
  const totalCollected = series.reduce((sum, item) => sum + item.collected, 0);

  if (!target) return null;

  return createPortal(
    <section className="pc-ca-panel">
      <header>
        <div>
          <span>Analyse du chiffre d’affaires</span>
          <h2>Facturé et encaissé dans le temps</h2>
          <p>Cliquez sur les indicateurs du tableau de bord pour ouvrir directement leur détail.</p>
        </div>
        <div className="pc-ca-periods" aria-label="Période du graphique">
          {(["3", "6", "12", "all"] as Period[]).map((value) => (
            <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>
              {value === "all" ? "Tout" : `${value} mois`}
            </button>
          ))}
        </div>
      </header>

      <div className="pc-ca-summary">
        <button onClick={() => openSection("Factures")}>
          <span>Facturé sur la période</span><strong>{euro(totalBilled)}</strong><ChevronRight size={17} />
        </button>
        <button onClick={() => openSection("Factures")}>
          <span>Encaissé sur la période</span><strong>{euro(totalCollected)}</strong><ChevronRight size={17} />
        </button>
      </div>

      <div className="pc-ca-chart" role="img" aria-label="Courbe du chiffre d’affaires facturé et encaissé">
        {series.length ? series.map((item) => {
          const billedHeight = Math.max(3, (item.billed / max) * 100);
          const collectedHeight = Math.max(3, (item.collected / max) * 100);
          return (
            <div className="pc-ca-column" key={item.key}>
              <div className="pc-ca-bars">
                <button title={`Facturé : ${euro(item.billed)}`} style={{ height: `${billedHeight}%` }} className="billed" onClick={() => openSection("Factures")} />
                <button title={`Encaissé : ${euro(item.collected)}`} style={{ height: `${collectedHeight}%` }} className="collected" onClick={() => openSection("Factures")} />
              </div>
              <span>{item.label}</span>
            </div>
          );
        }) : <div className="pc-ca-empty"><BarChart3 size={28} /><span>Les données apparaîtront ici dès qu’une facture sera créée.</span></div>}
      </div>
      <div className="pc-ca-legend"><span><i className="billed" /> Facturé</span><span><i className="collected" /> Encaissé</span></div>
    </section>,
    target,
  );
}
