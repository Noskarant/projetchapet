"use client";

import {
  BarChart3,
  Building2,
  Check,
  FileText,
  HardHat,
  ImagePlus,
  Loader2,
  Mic,
  Search,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  defaultCompanyProfile,
  readCompanyProfile,
  writeCompanyProfile,
  type CompanyProfile,
} from "@/lib/company-profile";
import {
  companyOnboardingMissingFields,
  markCompanyOnboardingComplete,
  markTutorialComplete,
  resolveFirstRunStage,
} from "@/lib/first-run-onboarding";
import { supabase } from "@/lib/supabase";

type Stage = "checking" | "company" | "tutorial" | "done";

type LookupCompany = {
  companyName: string;
  siret: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
};

const tutorialSlides = [
  {
    icon: BarChart3,
    eyebrow: "PILOTEZ EN UN COUP D’ŒIL",
    title: "Votre activité commence ici.",
    text: "Le tableau de bord rassemble chiffre d’affaires, encaissements, devis à relancer et priorités du jour.",
    note: "Vous gardez l’essentiel visible sans ouvrir dix écrans.",
  },
  {
    icon: FileText,
    eyebrow: "DEVIS & FACTURES",
    title: "Créez comme vous travaillez.",
    text: "Vous pouvez saisir un document manuellement ou dicter votre demande à l’IA, puis tout vérifier avant validation.",
    note: "MANUFEO n’envoie jamais un document à votre place sans votre action.",
  },
  {
    icon: UsersRound,
    eyebrow: "CLIENTS & ENCAISSEMENTS",
    title: "Gardez tout le dossier au même endroit.",
    text: "Retrouvez les coordonnées, documents, statuts et paiements liés à chaque client sans ressaisie inutile.",
    note: "Les informations de votre entreprise alimentent aussi vos documents et e-mails.",
  },
  {
    icon: HardHat,
    eyebrow: "CHANTIERS & COPILOTE",
    title: "Le terrain reste connecté au bureau.",
    text: "Photos, étapes, incidents et copilote chantier restent accessibles sur mobile pendant que le bureau conserve la vue complète.",
    note: "Vous êtes prêt. Le tutoriel pourra évoluer avec les nouvelles fonctions de MANUFEO.",
  },
];

function asDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Lecture du logo impossible."));
    reader.readAsDataURL(file);
  });
}

function humanMissingField(field: string) {
  const labels: Record<string, string> = {
    legalName: "la raison sociale",
    siret: "un SIRET valide à 14 chiffres",
    email: "l’e-mail de l’entreprise",
    phone: "le téléphone",
    address: "l’adresse",
    postalCode: "le code postal",
    city: "la ville",
  };
  return labels[field] || field;
}

export default function FirstRunOnboarding() {
  const [stage, setStage] = useState<Stage>("checking");
  const [companyStep, setCompanyStep] = useState(0);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const [profile, setProfile] = useState<CompanyProfile>(() => defaultCompanyProfile());
  const [message, setMessage] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) {
        if (active) setStage("done");
        return;
      }

      const stored = readCompanyProfile(window.localStorage);
      const metadataCompany = typeof data.user.user_metadata?.company_name === "string"
        ? data.user.user_metadata.company_name.trim()
        : "";
      const hydrated: CompanyProfile = {
        ...stored,
        legalName: stored.legalName || metadataCompany,
        displayName: stored.displayName || metadataCompany,
        email: stored.email || data.user.email || "",
      };
      setProfile(hydrated);
      const next = resolveFirstRunStage(stored);
      setStage(next || "done");
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (stage === "checking" || stage === "done") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [stage]);

  async function lookupCompany() {
    const siret = profile.siret.replace(/\D/g, "");
    if (siret.length !== 14) {
      setMessage("Renseignez les 14 chiffres du SIRET avant la recherche.");
      return;
    }
    setLookupBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/company-lookup?siret=${encodeURIComponent(siret)}`, { cache: "no-store" });
      const data = await response.json() as { company?: LookupCompany; error?: string };
      if (!response.ok || !data.company) throw new Error(data.error || "Entreprise introuvable.");
      setProfile((current) => ({
        ...current,
        legalName: data.company!.companyName || current.legalName,
        displayName: current.displayName || data.company!.companyName || current.displayName,
        siret: data.company!.siret,
        vatNumber: data.company!.vatNumber || current.vatNumber,
        address: data.company!.address || current.address,
        postalCode: data.company!.postalCode || current.postalCode,
        city: data.company!.city || current.city,
      }));
      setMessage("Entreprise trouvée : vérifiez les informations avant de continuer.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recherche impossible.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function chooseLogo(file: File | null) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setMessage("Utilisez un logo PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 550_000) {
      setMessage("Le logo doit faire moins de 550 Ko.");
      return;
    }
    try {
      const logoDataUrl = await asDataUrl(file);
      setProfile((current) => ({ ...current, logoDataUrl }));
      setMessage("Logo ajouté.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo impossible à lire.");
    }
  }

  function goToCompanyDetails() {
    const missing = companyOnboardingMissingFields(profile).filter((field) => field === "legalName" || field === "siret");
    if (missing.length) {
      setMessage(`Il manque ${missing.map(humanMissingField).join(" et ")}.`);
      return;
    }
    setMessage("");
    setCompanyStep(1);
  }

  function saveCompany() {
    const normalizedProfile = {
      ...profile,
      displayName: profile.displayName.trim() || profile.legalName.trim(),
    };
    const missing = companyOnboardingMissingFields(normalizedProfile);
    if (missing.length) {
      setMessage(`Complétez ${missing.map(humanMissingField).join(", ")}.`);
      return;
    }
    const saved = writeCompanyProfile(
      window.localStorage,
      markCompanyOnboardingComplete(normalizedProfile),
    );
    setProfile(saved);
    window.dispatchEvent(new CustomEvent("projetchapet:company-profile-updated", { detail: saved }));
    setMessage("");
    setTutorialIndex(0);
    setStage("tutorial");
  }

  function finishTutorial() {
    const current = readCompanyProfile(window.localStorage);
    const saved = writeCompanyProfile(window.localStorage, markTutorialComplete(current));
    setProfile(saved);
    window.dispatchEvent(new CustomEvent("projetchapet:company-profile-updated", { detail: saved }));
    setStage("done");
  }

  if (stage === "checking" || stage === "done") return null;

  if (stage === "tutorial") {
    const slide = tutorialSlides[tutorialIndex];
    const Icon = slide.icon;
    const last = tutorialIndex === tutorialSlides.length - 1;
    return (
      <div className="fro-backdrop" role="dialog" aria-modal="true" aria-label="Découvrir MANUFEO">
        <section className="fro-panel fro-tutorial-panel">
          <header className="fro-topbar">
            <a className="fro-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="MANUFEO">
              <img src="/manufeo-mark.webp" alt="" />
              <strong>MANUFEO</strong>
            </a>
            <button type="button" className="fro-skip" onClick={finishTutorial}>Passer le tutoriel</button>
          </header>
          <div className="fro-tutorial-body">
            <div className="fro-tutorial-visual"><Icon size={44} /></div>
            <span className="fro-eyebrow">{slide.eyebrow}</span>
            <h1>{slide.title}</h1>
            <p>{slide.text}</p>
            <div className="fro-tip"><Check size={17} />{slide.note}</div>
          </div>
          <footer className="fro-tutorial-footer">
            <div className="fro-dots" aria-label={`Étape ${tutorialIndex + 1} sur ${tutorialSlides.length}`}>
              {tutorialSlides.map((_, index) => <i key={index} className={index === tutorialIndex ? "active" : ""} />)}
            </div>
            <div>
              {tutorialIndex > 0 && <button type="button" className="fro-secondary" onClick={() => setTutorialIndex((value) => value - 1)}>Retour</button>}
              <button type="button" className="fro-primary" onClick={() => last ? finishTutorial() : setTutorialIndex((value) => value + 1)}>
                {last ? "Commencer avec MANUFEO" : "Suivant"}
              </button>
            </div>
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div className="fro-backdrop" role="dialog" aria-modal="true" aria-label="Configuration initiale de l’entreprise">
      <section className="fro-panel">
        <header className="fro-topbar">
          <div className="fro-brand"><img src="/manufeo-mark.webp" alt="" /><strong>MANUFEO</strong></div>
          <span>Configuration initiale · {companyStep + 1}/2</span>
        </header>
        <div className="fro-progress"><i style={{ width: companyStep === 0 ? "50%" : "100%" }} /></div>
        <div className="fro-company-body">
          {companyStep === 0 ? (
            <>
              <div className="fro-heading"><Building2 size={25} /><div><span>VOTRE ENTREPRISE</span><h1>Commençons par votre identité.</h1><p>Ces informations alimenteront vos devis, factures et e-mails. Cette étape est obligatoire une seule fois.</p></div></div>
              <div className="fro-form-grid">
                <label>Raison sociale *<input autoFocus value={profile.legalName} onChange={(event) => setProfile({ ...profile, legalName: event.target.value })} placeholder="Ex. Martin Peinture SARL" /></label>
                <label>Nom commercial<input value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} placeholder="Ex. Martin Peinture" /></label>
                <div className="fro-siret">
                  <label>SIRET *<input inputMode="numeric" value={profile.siret} onChange={(event) => setProfile({ ...profile, siret: event.target.value.replace(/\D/g, "").slice(0, 14) })} placeholder="14 chiffres" /></label>
                  <button type="button" onClick={() => void lookupCompany()} disabled={lookupBusy}>{lookupBusy ? <Loader2 className="fro-spin" size={17} /> : <Search size={17} />} Rechercher</button>
                </div>
                <label>TVA intracommunautaire <small>facultatif si non applicable</small><input value={profile.vatNumber} onChange={(event) => setProfile({ ...profile, vatNumber: event.target.value })} placeholder="FR…" /></label>
              </div>
            </>
          ) : (
            <>
              <div className="fro-heading"><WalletCards size={25} /><div><span>COORDONNÉES & DOCUMENTS</span><h1>Complétez les informations utiles.</h1><p>Logo et e-mail comptable restent facultatifs. Vous pourrez tout modifier ensuite dans les paramètres.</p></div></div>
              <div className="fro-form-grid fro-two-columns">
                <label>E-mail entreprise *<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} placeholder="contact@entreprise.fr" /></label>
                <label>Téléphone *<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="06… / 04…" /></label>
                <label className="fro-wide">Adresse *<input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} placeholder="12 rue des Artisans" /></label>
                <label>Code postal *<input value={profile.postalCode} onChange={(event) => setProfile({ ...profile, postalCode: event.target.value })} /></label>
                <label>Ville *<input value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} /></label>
                <label>E-mail du comptable<input type="email" value={profile.accountingEmail} onChange={(event) => setProfile({ ...profile, accountingEmail: event.target.value })} placeholder="compta@cabinet.fr" /></label>
                <div className="fro-logo-field">
                  <span>Logo de l’entreprise</span>
                  <div>{profile.logoDataUrl ? <img src={profile.logoDataUrl} alt="Logo de l’entreprise" /> : <ImagePlus size={22} />}<label>Choisir un logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseLogo(event.target.files?.[0] ?? null)} /></label></div>
                </div>
              </div>
            </>
          )}
          {message && <p className="fro-message" role="status">{message}</p>}
        </div>
        <footer className="fro-company-footer">
          <span>Les champs marqués * sont nécessaires pour préparer correctement vos documents.</span>
          <div>
            {companyStep === 1 && <button type="button" className="fro-secondary" onClick={() => { setMessage(""); setCompanyStep(0); }}>Retour</button>}
            <button type="button" className="fro-primary" onClick={() => companyStep === 0 ? goToCompanyDetails() : saveCompany()}>{companyStep === 0 ? "Continuer" : "Enregistrer et découvrir MANUFEO"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
