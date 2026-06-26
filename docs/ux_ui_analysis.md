# Analisi UX/UI — ClosedRoom Frontend

> Audit completo dell'interfaccia React/Vite.  
> Data: 26 Giugno 2026 · Autore: Automated UX Audit  
> Scope: `frontend/src/` — 6.826 righe di codice analizzate

---

## Executive Summary

Il design system sottostante (palette colori, font Outfit, animazioni, glassmorphism, dark/light theme) è **solido e premium**. I problemi non sono estetici ma **strutturali**:

1. **Information overload** — Tutte le sezioni visibili contemporaneamente, zero progressive disclosure
2. **Overlap e layout rotti** — Componenti che si sovrappongono in area hero e su viewport medi
3. **Nessun pattern dialog/overlay** — Il codebase non ha un componente Dialog o Sheet per mostrare dettagli on-demand
4. **Responsive insufficiente** — Layout a griglia fissa che collassa male sotto 1024px
5. **Demo mode nascosto e confuso** — Attivazione solo da menu help, nessun banner contestuale

---

## 1. Problemi Rilevati

### 🔴 Critici — Overlap e Layout Rotti

| # | Problema | File | Evidenza |
|---|---------|------|----------|
| C1 | **GuidanceCallout sovrappone il titolo progetto** — La callout "What to expect" si posiziona sopra/accanto a "Job Pulse" senza margine, coprendo testo | [ProjectsPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/ProjectsPage.tsx#L320-L361) | Screenshot 1 |
| C2 | **Pannello periodo flotta fuori dal container** — `TimeRangeFilter` + etichetta calendario sconfinano a destra del hero | [ProjectsPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/ProjectsPage.tsx#L349-L359) | Screenshot 1 |
| C3 | **Nessun responsive sotto `lg`** — `grid-cols-[280px_minmax(0,1fr)]` collassa male in 768-1024px | [ProjectsPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/ProjectsPage.tsx#L309) | Breakpoint mancante |
| C4 | **Troppi pannelli senza gerarchia** — Hero + Guidance + KPI + Meetings + Actions + Decisions + Digest + ToComplete + Risks + Advanced tutti visibili in scroll | [DashboardPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/DashboardPage.tsx#L191-L441) | Screenshot 2 |

### 🟠 Gravi — UX Flat / Zero Progressive Disclosure

| # | Problema | Impatto |
|---|---------|---------|
| G1 | **Tutte le sezioni visibili in simultanea** — Actions, Decisions, Risks, Digest, Meetings, ToComplete senza collasso o gerarchia | Cognitive overload, l'utente non sa dove guardare |
| G2 | **KPI a zero sempre mostrate** — 6 card numeriche tutte a "0" danno impressione vuota e inutile | Empty state non gestito per KPI grid |
| G3 | **Nessun dialog/overlay per dettaglio insight** — Azioni, decisioni, rischi troncati a 180 char inline. Nessun click-to-expand, sheet, modal | Pattern bloccante per informazioni ricche |
| G4 | **Sidebar progetti sempre visibile su mobile** — 280px fissi comprimono contenuto. Nessun drawer o bottom sheet su viewport < 1024px | Mobile inutilizzabile |
| G5 | **MeetingCard troppo densa** — Titolo + badge stato + data + durata + progetto + badge trascrizione + 3 badge analisi + bottone, tutto in una riga | Card sovraccariche |

### 🟡 Medi — Gerarchia Visiva e Design

| # | Problema | Impatto |
|---|---------|---------|
| M1 | **Nessuna distinzione tra sezioni primarie e secondarie** — Meetings, Actions, Decisions, Risks, Digest tutti con lo stesso `.surface-primary rounded-2xl p-4` | Tutto piatto, nessuna gerarchia |
| M2 | **Hero zone troppo rumorosa** — Eyebrow + titolo + desc + badge + 2 azioni + callout + 2 filtri nell'area più importante | Focus disperso |
| M3 | **Layout a 3 colonne implicito** — Sidebar + Main + Aside su 1280-1440px lascia < 500px al contenuto principale | Troppo compresso |
| M4 | **Testi `text-[11px]` illeggibili** — Metadata, date, micro-badge sotto la soglia di leggibilità su schermi HiDPI | Accessibilità compromessa |
| M5 | **Demo mode poco visibile** — Badge piccolo in navbar, exit nascosto, nessun banner contestuale | Confusione utente |

---

## 2. Audit Dimensioni File

| File | Righe | Stato | Note |
|------|-------|-------|------|
| [RecordingPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/RecordingPage.tsx) | **951** | 🔴 Troppo grande | Logica recorder + visualizer + UI monolitica |
| [ProjectsPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/ProjectsPage.tsx) | **639** | 🟠 Al limite | `ProjectTimelineItem` inline, logica complessa |
| [AnalysisPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/AnalysisPage.tsx) | **619** | 🟠 Al limite | Import/history/settings/results tutto in un file |
| [MeetingWorkspace.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/components/workspace/MeetingWorkspace.tsx) | **602** | 🟠 Al limite | 12 componenti esportati in un unico file |
| [TranscriptionPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/TranscriptionPage.tsx) | **600** | 🟠 Al limite | Pattern monolitico |
| [SettingsPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/SettingsPage.tsx) | **520** | 🟡 OK-ish | Beneficierebbe di tab/accordion |
| [DashboardPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/DashboardPage.tsx) | **515** | 🟡 OK | Ma layout troppo denso |
| [MeetingDetailPage.tsx](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/pages/MeetingDetailPage.tsx) | **447** | ✅ OK | Il più vicino a un buon pattern |
| [index.css](file:///Users/moltisantid/Personal/local-asr-server/frontend/src/index.css) | **931** | 🟡 Monolite | Design system solido ma unico file |

**Totale:** 6.826 righe di codice UI

---

## 3. Analisi Design System

### ✅ Punti di Forza (Da Preservare)

| Aspetto | Dettaglio |
|---------|-----------|
| **Palette colori** | Curata, coerente, ben mappata su CSS custom properties. Dark/light theme completi |
| **Font** | Outfit (display) + JetBrains Mono (code) — scelta moderna e leggibile |
| **Animazioni** | `animate-page-in`, `animate-fade-in`, `stagger-list`, spring timing — professionali |
| **Glassmorphism** | `bg-bg-glass`, `backdrop-blur`, `surface-highlight` — effetto premium |
| **Gradient system** | `gradient-primary`, `gradient-surface`, app-page-gradient — sofisticati |
| **Shadow system** | 4 livelli (soft, card, premium, cta) — buona gerarchia di profondità |
| **Token structure** | CSS custom properties → Tailwind `@theme` mapping — architettura pulita |
| **i18n** | Completo IT/EN con `useTranslation()` hook |

### ❌ Punti di Debolezza

| Aspetto | Dettaglio |
|---------|-----------|
| **Nessun componente Dialog/Modal** | Manca completamente nel design system |
| **Nessun componente Sheet/Drawer** | Manca completamente |
| **Nessun pattern responsive** | Le media queries sono assenti, solo Tailwind breakpoints inline |
| **Nessun z-index layer system** | z-index sparsi e ad-hoc (z-40, z-50) |
| **Componenti UI primitivi limitati** | Solo Badge, Button, Card, Checkbox, Input, Select, Tooltip. Manca: Dialog, Sheet, Tabs, Accordion |

---

## 4. Pattern di Redesign Proposti

### 4.1 — Progressive Disclosure a 3 Livelli

```
Livello 1: HERO        → Titolo, azione primaria, stato globale
Livello 2: SPOTLIGHT    → Le 2-3 info più importanti (meeting recente, KPI chiave)
Livello 3: ON-DEMAND    → Tutto il resto, accessibile via Dialog/Accordion/Sheet
```

**Applicazione alla Dashboard:**

```
┌─────────────────────────────────────────────────────────┐
│  HERO: "Oggi" + 4 KPI inline compatti + [Record]        │
├─────────────────────────────────────────────────────────┤
│  SPOTLIGHT: 3 MeetingCard recenti                        │
│  [Vedi tutti i meeting →] → Dialog lista completa        │
├───────────────────────┬─────────────────────────────────┤
│  Quick Actions (top 3)│  Digest (top 2)                  │
│  [Vedi N azioni →]    │  [Situazione completa →]         │
│  → Dialog dettaglio   │  → Dialog digest                 │
└───────────────────────┴─────────────────────────────────┘
```

### 4.2 — Dialog/Sheet con Radix UI Primitives

Libreria scelta: **@radix-ui/react-dialog** (headless, zero styling, a11y-compliant)

**Vantaggi:**
- Focus trap automatico
- ESC close nativo
- aria-attributes corretti
- Composable con il design system esistente
- Zero opinione sullo stile — si usa il CSS/Tailwind esistente

**Pattern proposto:**

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogOverlay />    // backdrop-blur + bg-black/60
  <DialogContent>      // responsive: modal desktop, bottom sheet mobile
    <DialogHeader />
    <DialogBody />
    <DialogFooter />
  </DialogContent>
</Dialog>
```

### 4.3 — Responsive Strategy

| Viewport | Layout | Sidebar | Dialog |
|----------|--------|---------|--------|
| ≤ 640px | 1 colonna | Hidden, bottom tab | Bottom sheet full-width |
| 641-1024px | 1-2 colonne | Drawer overlay | Modal centrato |
| 1025-1440px | 2 colonne + aside | Visibile, collapsible | Modal centrato max-w-2xl |
| ≥ 1441px | 3 colonne | Sempre visibile | Side sheet o modal large |

### 4.4 — Redesign Demo Mode

**Attivazione:**
- Empty state → CTA prominente "Esplora con dati di esempio"
- URL parameter `?demo=true` per link condivisibili
- Toggle nella navbar sempre accessibile

**Banner contestuale:**
```
┌────────────────────────────────────────────────────────────┐
│ 🎭 Stai esplorando con dati dimostrativi                    │
│    Registra un meeting reale per iniziare.                  │
│                                   [Esci dalla demo] [Tour] │
└────────────────────────────────────────────────────────────┘
```

**Client-side puro:** dati mock funzionanti anche senza backend attivo.

---

## 5. Componenti UI Mancanti (Da Creare)

| Componente | Scopo | Dipendenza |
|------------|-------|------------|
| `Dialog` | Modal overlay per dettagli on-demand | `@radix-ui/react-dialog` |
| `Sheet` | Side sheet per contenuti lunghi (transcript, analysis) | `@radix-ui/react-dialog` |
| `InsightDetailDialog` | Dialog specifico per Action/Decision/Risk | `Dialog` |
| `MeetingListDialog` | Dialog lista meeting completa con filtro | `Dialog` |
| `DemoBanner` | Banner fisso per demo mode | - |
| `EmptyStateHero` | Stato vuoto pagine principali con CTA demo | - |
| `ProjectSidebarDrawer` | Drawer mobile per sidebar progetti | `Sheet` |

---

## 6. Metriche Obiettivo Post-Redesign

| Metrica | Attuale | Obiettivo |
|---------|---------|-----------|
| Sezioni visibili in first fold (Dashboard) | ~8 | **3-4** |
| Sezioni visibili in first fold (Projects) | ~7 | **3** |
| Max righe per page component | 951 | **≤ 400** |
| Componenti in MeetingWorkspace.tsx | 12 | **≤ 4** (resto in file dedicati) |
| Font size minima | 11px | **12px** |
| Breakpoints responsive testati | 2 (lg, xl) | **4** (sm, md, lg, xl) |
| Componenti UI primitivi | 8 | **12+** (aggiunta Dialog, Sheet, Tabs, Drawer) |
| Demo mode discovery | Solo menu help | **Empty state + navbar + URL param** |
