"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./pdf-pages.css";
import { clearPdfPrint, preparePdfPrint, printPdfPages } from '@/lib/document-print';

// Render every page ourselves: Safari's embedded PDF viewer can show only page one.
export default function PdfPages({ url, title }: { url: string; title: string }) {
  const viewer = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);
  const [pageAspect, setPageAspect] = useState(Math.SQRT2);
  const [error, setError] = useState(false);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const beforePrint = () => { preparePdfPrint(); };
    const afterPrint = () => { clearPdfPrint(); };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      clearPdfPrint();
    };
  }, []);
  const zoom = useCallback((value: number, center?: { x: number; y: number }, resetPosition = false) => {
    const root = viewer.current;
    if (!root) return;
    const next = Math.min(3, Math.max(.1, value));
    const previous = scaleRef.current;
    const rect = root.getBoundingClientRect();
    const x = center ? center.x - rect.left : root.clientWidth / 2;
    const y = center ? center.y - rect.top : root.clientHeight / 2;
    const left = (root.scrollLeft + x) * next / previous - x;
    const top = (root.scrollTop + y) * next / previous - y;
    scaleRef.current = next;
    setScale(next);
    requestAnimationFrame(() => { root.scrollLeft = resetPosition ? 0 : left; root.scrollTop = resetPosition ? 0 : top; });
  }, []);
  useEffect(() => {
    const root = viewer.current;
    if (!root) return;
    const resize = () => setFitWidth(Math.min(900, Math.max(1, root.clientWidth - 24)));
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    let pinch: { distance: number; scale: number } | null = null;
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      pinch = { distance: distance(event.touches), scale: scaleRef.current };
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch || pinch.distance === 0) return;
      event.preventDefault();
      zoom(pinch.scale * distance(event.touches) / pinch.distance, {
        x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
        y: (event.touches[0].clientY + event.touches[1].clientY) / 2,
      });
    };
    const end = () => { pinch = null; };
    root.addEventListener("touchstart", start, { passive: false });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", end);
    root.addEventListener("touchcancel", end);
    return () => {
      observer.disconnect();
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", move);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", end);
    };
  }, [zoom]);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(false);
    setCount(0);
    setReady(false);
    scaleRef.current = 1;
    setScale(1);
    const root = container.current;
    root?.replaceChildren();
    void (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (cancelled || !root) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ url, standardFontDataUrl: "/pdf-standard-fonts/" });
      destroy = () => { void task.destroy(); };
      const document = await task.promise;
      if (cancelled) return;
      setCount(document.numPages);
      for (let number = 1; number <= document.numPages; number += 1) {
        if (cancelled) return;
        const page = await document.getPage(number);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 2 });
        if (number === 1) setPageAspect(viewport.height / viewport.width);
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${title}, page ${number} sur ${document.numPages}`);
        root.append(canvas);
        await page.render({ canvas, viewport }).promise;
        page.cleanup();
      }
      if (!cancelled) setReady(true);
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; destroy?.(); root?.replaceChildren(); };
  }, [url, title]);
  return <section ref={viewer} className="manufeo-pdf-viewer" aria-label={title} data-pdf-scale={scale.toFixed(2)} data-pdf-ready={ready}>
    <div className="manufeo-pdf-tools" role="group" aria-label="Zoom du PDF">
      <button type="button" aria-label="Réduire le PDF" disabled={scale <= .1} onClick={() => zoom(scaleRef.current - .25)}>−</button>
      <button type="button" aria-label="Adapter le PDF à l’écran" onClick={() => zoom(1, undefined, true)}>{Math.round(scale * 100)} %</button>
      <button type="button" aria-label="Afficher la page entière" onClick={() => {
        const root = viewer.current;
        if (!root || !fitWidth) return;
        const reserved = (root.querySelector<HTMLElement>('.manufeo-pdf-tools')?.offsetHeight || 0)
          + (root.querySelector<HTMLElement>(':scope > p')?.offsetHeight || 0) + 24;
        zoom(Math.min(1, (root.clientHeight - reserved) / (fitWidth * pageAspect)), undefined, true);
      }}>Page entière</button>
      <button type="button" aria-label="Agrandir le PDF" disabled={scale >= 3} onClick={() => zoom(scaleRef.current + .25)}>+</button>
      <button type="button" disabled={!ready || error} onClick={() => void printPdfPages()}>Imprimer</button>
    </div>
    <p role="status">{error ? "L’aperçu n’a pas pu être affiché." : count ? `${count} page${count > 1 ? "s" : ""} — faites défiler pour tout consulter` : "Chargement du PDF…"}
      {error && <> <a href={url} target="_blank" rel="noopener noreferrer">Ouvrir le PDF</a></>}
    </p>
    <div ref={container} className="manufeo-pdf-pages" style={{ width: fitWidth ? fitWidth * scale + 24 : '100%' }} />
  </section>;
}
