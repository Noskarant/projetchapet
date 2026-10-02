"use client";

import { useEffect, useRef, useState } from "react";
import "./pdf-pages.css";

// Render every page ourselves: Safari's embedded PDF viewer can show only page one.
export default function PdfPages({ url, title }: { url: string; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(false);
    setCount(0);
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
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${title}, page ${number} sur ${document.numPages}`);
        root.append(canvas);
        await page.render({ canvas, viewport }).promise;
        page.cleanup();
      }
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; destroy?.(); root?.replaceChildren(); };
  }, [url, title]);
  return <section className="manufeo-pdf-viewer" aria-label={title}>
    <p role="status">{error ? "L’aperçu n’a pas pu être affiché." : count ? `${count} page${count > 1 ? "s" : ""} — faites défiler pour tout consulter` : "Chargement du PDF…"}
      {error && <> <a href={url} target="_blank" rel="noopener noreferrer">Ouvrir le PDF</a></>}
    </p>
    <div ref={container} className="manufeo-pdf-pages" />
  </section>;
}
