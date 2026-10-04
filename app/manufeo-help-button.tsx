"use client";

import { useState } from 'react';
import { createPortal } from 'react-dom';
import ManufeoHelpDialog from './manufeo-help-dialog';
import ManufeoMascot from './manufeo-mascot';

/** The help entry belongs to the navigation, independently of the greeting. */
export default function ManufeoHelpButton() {
  const [open, setOpen] = useState(false);
  const create = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('projetchapet:open-ai', { detail: { target: 'command' } }));
  };

  return <>
    <button type="button" className="manufeo-help-launcher" aria-label="Questions à MANUFEO" title="Poser une question à MANUFEO" onClick={() => setOpen(true)}>
      <ManufeoMascot />
    </button>
    {open && createPortal(<ManufeoHelpDialog canCreate onClose={() => setOpen(false)} onCreate={create} />, document.body)}
  </>;
}
