"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    const update = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((value) => {
        registration = value;
        document.addEventListener("visibilitychange", update);
      })
      .catch((error) => console.warn("[Projet Chapet] Service worker non disponible", error));

    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return null;
}
