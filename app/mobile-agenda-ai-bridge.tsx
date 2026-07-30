"use client";

import { CalendarCheck2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ParsedAgendaVoice } from "@/lib/mobile-agenda-voice";

type AgendaApplyDetail = {
  target?: "agenda";
  data?: ParsedAgendaVoice;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function waitFor<T extends Element>(selector: string, timeout = 2500): Promise<T> {
  const existing = document.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Élément introuvable : ${selector}`));
    }, timeout);
    const observer = new MutationObserver(() => {
      const element = document.querySelector<T>(selector);
      if (!element) return;
      window.clearTimeout(timer);
      observer.disconnect();
      resolve(element);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function findLabel(panel: Element, text: string) {
  const expected = normalize(text);
  return Array.from(panel.querySelectorAll("label")).find((label) => normalize(label.textContent || "").startsWith(expected));
}

function findNavigationButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button"))
    .find((button) => normalize(button.textContent || "") === normalize(label));
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function agendaTitle(data: ParsedAgendaVoice) {
  const title = data.title.trim() || "Rendez-vous";
  const location = data.location.trim();
  if (!location || normalize(title).includes(normalize(location))) return title;
  return `${title} · ${location}`;
}

export default function MobileAgendaAiBridge() {
  const [message, setMessage] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const notify = (value: string) => {
      setMessage(value);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(""), 3600);
    };

    const applyAgenda = async (data: ParsedAgendaVoice) => {
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 80));

        const existingEditor = document.querySelector<HTMLButtonElement>(".rm-v2-editor > header > button");
        existingEditor?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 60));

        const agendaNavigation = findNavigationButton("Agenda");
        if (!agendaNavigation) throw new Error("La section Agenda est introuvable.");
        agendaNavigation.click();
        await new Promise((resolve) => window.setTimeout(resolve, 100));

        const createButton = await waitFor<HTMLButtonElement>(".rm-header-plus");
        createButton.click();
        const editor = await waitFor<HTMLElement>(".rm-v2-editor");

        const typeSelect = findLabel(editor, "Type")?.querySelector<HTMLSelectElement>("select");
        const customerSelect = findLabel(editor, "Client")?.querySelector<HTMLSelectElement>("select");
        const dateInput = findLabel(editor, "Date")?.querySelector<HTMLInputElement>("input[type='date']");
        const timeInput = findLabel(editor, "Heure")?.querySelector<HTMLInputElement>("input[type='time']");
        const titleInput = findLabel(editor, "Consigne")?.querySelector<HTMLTextAreaElement>("textarea");

        if (!typeSelect || !customerSelect || !dateInput || !timeInput || !titleInput) {
          throw new Error("Le formulaire Agenda n’a pas pu être préparé.");
        }

        const customerHint = normalize(data.customer_hint);
        const customerOption = Array.from(customerSelect.options).find((option) => {
          const name = normalize(option.textContent || "");
          return name === customerHint || name.includes(customerHint) || customerHint.includes(name);
        });
        if (!customerOption) throw new Error(`Client « ${data.customer_hint} » introuvable.`);

        setNativeValue(typeSelect, data.type);
        setNativeValue(customerSelect, customerOption.value);
        setNativeValue(dateInput, data.date);
        setNativeValue(timeInput, data.time);
        setNativeValue(titleInput, agendaTitle(data));
        await new Promise((resolve) => window.setTimeout(resolve, 140));

        const saveButton = editor.querySelector<HTMLButtonElement>(".rm-save-button");
        if (!saveButton) throw new Error("Le bouton d’enregistrement est introuvable.");
        saveButton.click();
        await new Promise((resolve) => window.setTimeout(resolve, 160));

        const summaryButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-agenda-summary button"));
        const desiredLabel = data.date === todayIso() ? "Aujourd’hui" : "Cette semaine";
        summaryButtons.find((button) => normalize(button.textContent || "").startsWith(normalize(desiredLabel)))?.click();
        notify("Événement ajouté à l’agenda.");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Impossible d’ajouter l’événement à l’agenda.");
      }
    };

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AgendaApplyDetail>).detail;
      if (detail?.target !== "agenda" || !detail.data) return;
      void applyAgenda(detail.data);
    };

    window.addEventListener("projetchapet:agenda-ai-apply", handler);
    return () => {
      window.removeEventListener("projetchapet:agenda-ai-apply", handler);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!message) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        zIndex: 100000,
        left: 16,
        right: 16,
        bottom: 106,
        maxWidth: 520,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "13px 15px",
        borderRadius: 14,
        color: "#fff",
        background: "#166534",
        boxShadow: "0 16px 40px rgba(15, 23, 42, .3)",
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      <CalendarCheck2 size={19} /> {message}
    </div>
  );
}
