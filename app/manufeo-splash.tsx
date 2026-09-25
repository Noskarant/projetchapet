"use client";

import { useEffect, useState } from "react";

export default function ManufeoSplash() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 650);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="manufeo-splash" role="status" aria-label="Ouverture de MANUFEO"><div className="manufeo-splash-mark"><img src="/icon-192.webp" alt="" /><strong>MANUFEO</strong></div></div>;
}
