"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Projet Chapet] Erreur d’interface non récupérée", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main
        role="alert"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f3f6f9",
          color: "#102a43",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(100%, 520px)",
            padding: 28,
            borderRadius: 20,
            background: "#fff",
            boxShadow: "0 18px 60px rgba(16, 42, 67, 0.14)",
          }}
        >
          <small style={{ fontWeight: 800, letterSpacing: "0.12em" }}>PROJET CHAPET</small>
          <h1 style={{ margin: "10px 0 8px", fontSize: 24 }}>L’application a rencontré un problème.</h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.55, color: "#52667a" }}>
            Les données enregistrées ne sont pas supprimées. Rechargez simplement le prototype pour reprendre.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              border: 0,
              borderRadius: 12,
              padding: "13px 18px",
              background: "#102a43",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Recharger le prototype
          </button>
        </section>
      </main>
    );
  }
}
