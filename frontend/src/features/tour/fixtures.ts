import type { Transcription } from '../../api/apiClient';

const TOUR_TRANSCRIPTION_IT: Transcription = {
  id: 'tour-demo-transcription',
  timestamp: '2026-06-24T10:00:00Z',
  model: 'mlx-community/nemotron-3.5-asr-streaming-0.6b',
  language: 'it',
  audio_filename: 'Riunione prodotto — esempio mock.wav',
  text: [
    'Marta: buongiorno, partirei dal rilascio di luglio e dallo stato della nuova dashboard.',
    'Luca: i dati di utilizzo sono incoraggianti, ma il flusso di attivazione ha ancora qualche abbandono.',
    'Marta: allora confermiamo il rilascio di luglio come priorità e rinviamo le richieste minori.',
    'Luca: d’accordo, entro domani preparo il dettaglio dei passaggi dove perdiamo più utenti.',
    'Sara: lato design la bozza è quasi pronta; mi servono solo le metriche per chiudere il messaggio iniziale.',
    'Marta: perfetto, Sara prepara la bozza definitiva entro venerdì e la condividiamo con il team.',
    'Luca: posso verificare anche gli eventi analytics e segnalare eventuali differenze tra web e desktop.',
    'Sara: aggiungo una nota sulle autorizzazioni, così il supporto sa cosa comunicare agli utenti.',
    'Marta: ottimo. Blocchiamo trenta minuti martedì mattina per rivedere dati, bozza e piano di rilascio.',
    'Luca: ricevuto, invio io l’invito e aggiorno la checklist prima della riunione.',
  ].join('\n'),
  segments: [
    { id: 0, start: 0, end: 10.2, speaker_label: 'Marta', text: 'Buongiorno, partirei dal rilascio di luglio e dallo stato della nuova dashboard.' },
    { id: 1, start: 10.5, end: 20.6, speaker_label: 'Luca', text: 'I dati di utilizzo sono incoraggianti, ma il flusso di attivazione ha ancora qualche abbandono.' },
    { id: 2, start: 21.0, end: 31.4, speaker_label: 'Marta', text: 'Allora confermiamo il rilascio di luglio come priorità e rinviamo le richieste minori.' },
    { id: 3, start: 31.8, end: 40.7, speaker_label: 'Luca', text: 'Entro domani preparo il dettaglio dei passaggi dove perdiamo più utenti.' },
    { id: 4, start: 41.1, end: 52.3, speaker_label: 'Sara', text: 'Lato design la bozza è quasi pronta; mi servono solo le metriche per chiudere il messaggio iniziale.' },
    { id: 5, start: 52.7, end: 63.2, speaker_label: 'Marta', text: 'Sara prepara la bozza definitiva entro venerdì e la condividiamo con il team.' },
    { id: 6, start: 63.5, end: 74.1, speaker_label: 'Luca', text: 'Verifico anche gli eventi analytics e segnalo eventuali differenze tra web e desktop.' },
    { id: 7, start: 74.4, end: 84.5, speaker_label: 'Sara', text: 'Aggiungo una nota sulle autorizzazioni, così il supporto sa cosa comunicare agli utenti.' },
    { id: 8, start: 84.9, end: 96.3, speaker_label: 'Marta', text: 'Blocchiamo trenta minuti martedì mattina per rivedere dati, bozza e piano di rilascio.' },
    { id: 9, start: 96.7, end: 106.4, speaker_label: 'Luca', text: 'Invio io l’invito e aggiorno la checklist prima della riunione.' },
  ],
  stats: { time_total_seconds: 1.2 },
};

const TOUR_TRANSCRIPTION_EN: Transcription = {
  id: 'tour-demo-transcription',
  timestamp: '2026-06-24T10:00:00Z',
  model: 'mlx-community/nemotron-3.5-asr-streaming-0.6b',
  language: 'en',
  audio_filename: 'Product meeting — mock example.wav',
  text: [
    'Marta: good morning, I would start with the July release and the status of the new dashboard.',
    'Luca: the usage data is encouraging, but the activation flow still has some drop-offs.',
    'Marta: so we confirm the July release as a priority and postpone minor requests.',
    'Luca: agreed, by tomorrow I will prepare the detail of the steps where we lose the most users.',
    'Sara: design-side the draft is almost ready; I just need the metrics to close the initial message.',
    'Marta: perfect, Sara prepares the final draft by Friday and we share it with the team.',
    'Luca: I can also check the analytics events and report any differences between web and desktop.',
    'Sara: I\'ll add a note about permissions, so support knows what to communicate to users.',
    'Marta: great. Let\'s block thirty minutes Tuesday morning to review data, draft, and release plan.',
    'Luca: received, I will send the invite and update the checklist before the meeting.',
  ].join('\n'),
  segments: [
    { id: 0, start: 0, end: 10.2, speaker_label: 'Marta', text: 'Good morning, I would start with the July release and the status of the new dashboard.' },
    { id: 1, start: 10.5, end: 20.6, speaker_label: 'Luca', text: 'The usage data is encouraging, but the activation flow still has some drop-offs.' },
    { id: 2, start: 21.0, end: 31.4, speaker_label: 'Marta', text: 'So we confirm the July release as a priority and postpone minor requests.' },
    { id: 3, start: 31.8, end: 40.7, speaker_label: 'Luca', text: 'By tomorrow I will prepare the detail of the steps where we lose the most users.' },
    { id: 4, start: 41.1, end: 52.3, speaker_label: 'Sara', text: 'Design-side the draft is almost ready; I just need the metrics to close the initial message.' },
    { id: 5, start: 52.7, end: 63.2, speaker_label: 'Marta', text: 'Sara prepares the final draft by Friday and we share it with the team.' },
    { id: 6, start: 63.5, end: 74.1, speaker_label: 'Luca', text: 'I can also check the analytics events and report any differences between web and desktop.' },
    { id: 7, start: 74.4, end: 84.5, speaker_label: 'Sara', text: 'I\'ll add a note about permissions, so support knows what to communicate to users.' },
    { id: 8, start: 84.9, end: 96.3, speaker_label: 'Marta', text: 'Let\'s block thirty minutes Tuesday morning to review data, draft, and release plan.' },
    { id: 9, start: 96.7, end: 106.4, speaker_label: 'Luca', text: 'I will send the invite and update the checklist before the meeting.' },
  ],
  stats: { time_total_seconds: 1.2 },
};

const TOUR_ANALYSIS_IT = {
  title: 'Rilascio di luglio: decisioni e attività',
  summary: 'Il team ha confermato che il rilascio di luglio è la priorità e ha rinviato le richieste minori. Luca analizzerà il flusso di attivazione e gli eventi analytics, mentre Sara completerà la bozza della dashboard. Il team rivedrà dati, messaggio e checklist in un incontro fissato per martedì mattina.',
  key_points: [
    'Il rilascio di luglio resta la priorità del team.',
    'Sara completa la bozza della dashboard entro venerdì.',
    'Luca analizza abbandoni ed eventi analytics prima della riunione successiva.',
  ],
  action_items: [
    'Sara: preparare la bozza definitiva entro venerdì.',
    'Luca: verificare dati di utilizzo ed eventi analytics.',
    'Team: rivedere gli aggiornamenti martedì mattina.',
  ],
};

const TOUR_ANALYSIS_EN = {
  title: 'July Release: decisions and activities',
  summary: 'The team confirmed that the July release is the priority and postponed minor requests. Luca will analyze the activation flow and analytics events, while Sara will complete the dashboard draft. The team will review data, message, and checklist in a meeting scheduled for Tuesday morning.',
  key_points: [
    'The July release remains the team\'s priority.',
    'Sara completes the dashboard draft by Friday.',
    'Luca analyzes drop-offs and analytics events before the next meeting.',
  ],
  action_items: [
    'Sara: prepare the final draft by Friday.',
    'Luca: verify usage data and analytics events.',
    'Team: review updates Tuesday morning.',
  ],
};

export function getTourTranscription(lang: string): Transcription {
  return lang === 'it' ? TOUR_TRANSCRIPTION_IT : TOUR_TRANSCRIPTION_EN;
}

export function getTourAnalysis(lang: string) {
  return lang === 'it' ? TOUR_ANALYSIS_IT : TOUR_ANALYSIS_EN;
}
