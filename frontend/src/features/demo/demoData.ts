import type { AnalysisRun, Meeting, Project, Recording, Transcription } from '../../api/apiClient';

const PROJECT_NAME = 'ClosedRoom Beta Launch';
const MODEL_ASR = 'mlx-community/nemotron-3.5-asr-streaming-0.6b';
const MODEL_LLM = 'nemotron-nano-4b-local';

function isoDaysAgo(days: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function epochSeconds(value: string, offset = 0): number {
  return Math.floor(new Date(value).getTime() / 1000) + offset;
}

function recording(id: string, title: string, createdAt: string, options: Partial<Recording> = {}): Recording {
  return {
    id,
    title,
    project_name: PROJECT_NAME,
    status: options.status || 'completed',
    mime_type: 'audio/wav',
    audio_file: `${id}/recording.wav`,
    capture_backend: 'native',
    capture_mode: 'both',
    bytes_written: options.bytes_written || 46_800_000,
    created_at: createdAt,
    stopped_at: options.stopped_at || createdAt,
    duration_seconds: options.duration_seconds || 2520,
    ...options,
  };
}

function transcription(id: string, recordingId: string, title: string, createdAt: string, text: string, lang = 'it'): Transcription {
  return {
    id,
    recording_id: recordingId,
    timestamp: createdAt,
    model: MODEL_ASR,
    language: lang,
    audio_filename: `${title}.wav`,
    text,
    stats: { time_total_seconds: 3.4 },
  };
}

function run(
  id: string,
  recordingId: string,
  transcriptionId: string,
  analysisType: string,
  createdAt: string,
  result: Record<string, unknown>,
  resultMarkdown?: string
): AnalysisRun {
  return {
    id,
    job_id: `job-${id}`,
    scope_type: 'recording',
    scope_id: recordingId,
    transcription_id: transcriptionId,
    recording_id: recordingId,
    analysis_type: analysisType,
    template_id: analysisType,
    template_version: 'demo',
    provider: 'mock',
    model: MODEL_LLM,
    reasoning: 'off',
    show_thinking: false,
    json_mode: true,
    llm_options: {},
    prompt_version: 'demo',
    input_hash: id,
    status: 'completed',
    result,
    result_markdown: resultMarkdown || null,
    source_ids: [recordingId, transcriptionId],
    created_at: epochSeconds(createdAt),
    completed_at: epochSeconds(createdAt, 45),
  };
}

function getMeetingSpecs(lang: string) {
  if (lang === 'it') {
    return [
      {
        id: 'demo-onboarding-permissions',
        title: 'Product sync - Onboarding e permessi macOS',
        createdAt: isoDaysAgo(0, 10, 15),
        duration: 2780,
        text: 'Il team conferma che il primo avvio deve spiegare solo cartella, microfono e cattura audio. Luca validara il flusso permessi entro venerdi, Sara chiudera la vista onboarding e Daniele preparera la demo beta.',
        brief: 'Il team ha riallineato il primo avvio: meno configurazione tecnica, permessi macOS guidati e demo pronta per i primi utenti beta.',
        actions: [
          { task: 'Validare il flusso permessi macOS con build firmata', owner: 'Luca', due_date: 'Venerdi', priority: 'Alta', status: 'open' },
          { task: 'Chiudere la vista onboarding con copy non tecnico', owner: 'Sara', due_date: 'Giovedi', priority: 'Alta', status: 'open' },
          { task: 'Preparare la demo per i primi utenti beta', owner: 'Daniele', due_date: 'Venerdi', priority: 'Media', status: 'open' },
        ],
        decisions: [
          { decision: 'La configurazione tecnica resta nascosta dietro dettagli avanzati.', rationale: 'Riduce attrito nel primo avvio.' },
          { decision: 'La modalita demo deve funzionare senza backend e senza dati reali.' },
        ],
        risks: [
          { risk: 'Permessi macOS possono bloccare la prima registrazione.', severity: 'Alta', next_step: 'Preflight guidato prima dello start.' },
        ],
      },
      {
        id: 'demo-design-review',
        title: 'Design review - Home e progetto workspace',
        createdAt: isoDaysAgo(0, 14, 30),
        duration: 2140,
        text: 'La review conferma che Home deve partire da cosa e successo oggi, mentre Progetti deve mostrare stato, azioni, decisioni e rischi. Il tour deve evidenziare aree reali della UI.',
        brief: 'Home e Progetti diventano viste outcome-first: digest, azioni, decisioni e rischi sono piu importanti dei dettagli tecnici.',
        actions: [
          { task: 'Aggiungere spotlight sui blocchi reali di Home', owner: 'Sara', due_date: 'Domani', priority: 'Alta', status: 'open' },
          { task: 'Rivedere gerarchia visuale del pannello Progetti', owner: 'Daniele', due_date: 'Settimana', priority: 'Media', status: 'open' },
        ],
        decisions: [
          { decision: 'Il tour guidato parte dalla Home piena, non dalla pagina Trascrizione.' },
          { decision: 'Le pagine manuali restano accessibili ma non sono il racconto principale.' },
        ],
        risks: [
          { risk: 'Troppa configurazione tecnica puo ridurre adozione.', severity: 'Media', next_step: 'Mostrare solo cio che serve nel contesto.' },
        ],
      },
      {
        id: 'demo-gtm-pricing',
        title: 'Go-to-market - Pricing e target utenti',
        createdAt: isoDaysAgo(1, 11, 0),
        duration: 1980,
        text: 'Il team decide di posizionare ClosedRoom su founder, consulenti e team prodotto che lavorano con materiale sensibile. La beta resta prevista per luglio.',
        brief: 'Il posizionamento beta punta su privacy locale, meeting intelligence e time saving per team piccoli con materiale sensibile.',
        actions: [
          { task: 'Preparare una pagina beta con focus privacy locale', owner: 'Marta', due_date: 'Lunedi', priority: 'Media', status: 'open' },
          { task: 'Raccogliere dieci profili beta in target', owner: 'Daniele', due_date: 'Fine mese', priority: 'Media', status: 'open' },
        ],
        decisions: [
          { decision: 'Il rilascio beta resta previsto per luglio.' },
          { decision: 'Il messaggio principale sara recuperare decisioni e azioni senza rileggere trascrizioni.' },
        ],
        risks: [
          { risk: 'Mancano dati realistici per mostrare il valore in demo.', severity: 'Media', next_step: 'Usare scenario beta launch coerente.' },
        ],
      },
      {
        id: 'demo-technical-review',
        title: 'Technical review - Nemotron locale e performance',
        createdAt: isoDaysAgo(2, 16, 45),
        duration: 3120,
        text: 'La review conferma che Nemotron locale e il sidecar gestito sono la direzione giusta. Restano da misurare startup, contesto e fallback quando il modello non e pronto.',
        brief: 'La pipeline locale e valida, ma il prodotto deve spiegare stato e fallback senza esporre dettagli di runtime agli utenti non tecnici.',
        actions: [
          { task: 'Misurare startup sidecar su MacBook Air M-series', owner: 'Luca', due_date: 'Settimana', priority: 'Media', status: 'open' },
          { task: 'Spostare diagnostica runtime sotto impostazioni avanzate', owner: 'Daniele', due_date: 'Prossimo sprint', priority: 'Bassa', status: 'open' },
        ],
        decisions: [
          { decision: 'Il sidecar locale resta gestito automaticamente in modalita auto.' },
        ],
        risks: [
          { risk: 'Startup modello locale puo sembrare blocco se la UI non comunica progress.', severity: 'Media', next_step: 'Usare job e service center.' },
        ],
      },
    ];
  } else {
    return [
      {
        id: 'demo-onboarding-permissions',
        title: 'Product sync - Onboarding and macOS permissions',
        createdAt: isoDaysAgo(0, 10, 15),
        duration: 2780,
        text: 'The team confirms that the first launch should only explain the folder, microphone, and audio capture. Luca will validate the permissions flow by Friday, Sara will close the onboarding view, and Daniele will prepare the beta demo.',
        brief: 'The team has realigned the first launch: less technical configuration, guided macOS permissions, and demo ready for the first beta users.',
        actions: [
          { task: 'Validate macOS permissions flow with signed build', owner: 'Luca', due_date: 'Friday', priority: 'High', status: 'open' },
          { task: 'Close onboarding view with non-technical copy', owner: 'Sara', due_date: 'Thursday', priority: 'High', status: 'open' },
          { task: 'Prepare demo for first beta users', owner: 'Daniele', due_date: 'Friday', priority: 'Medium', status: 'open' },
        ],
        decisions: [
          { decision: 'Technical configuration remains hidden behind advanced details.', rationale: 'Reduces friction during first launch.' },
          { decision: 'Demo mode must work without backend and without real data.' },
        ],
        risks: [
          { risk: 'macOS permissions can block the first recording.', severity: 'High', next_step: 'Guided preflight before start.' },
        ],
      },
      {
        id: 'demo-design-review',
        title: 'Design review - Home and project workspace',
        createdAt: isoDaysAgo(0, 14, 30),
        duration: 2140,
        text: 'The review confirms that Home must start with what happened today, while Projects must show status, actions, decisions, and risks. The tour must highlight real areas of the UI.',
        brief: 'Home and Projects become outcome-first views: digest, actions, decisions, and risks are more important than technical details.',
        actions: [
          { task: 'Add spotlight on real blocks of Home', owner: 'Sara', due_date: 'Tomorrow', priority: 'High', status: 'open' },
          { task: 'Review visual hierarchy of the Projects panel', owner: 'Daniele', due_date: 'Week', priority: 'Medium', status: 'open' },
        ],
        decisions: [
          { decision: 'Guided tour starts from the filled Home, not from the Transcription page.' },
          { decision: 'Manual pages remain accessible but are not the main narrative.' },
        ],
        risks: [
          { risk: 'Too much technical configuration can reduce adoption.', severity: 'Medium', next_step: 'Show only what is needed in context.' },
        ],
      },
      {
        id: 'demo-gtm-pricing',
        title: 'Go-to-market - Pricing and user target',
        createdAt: isoDaysAgo(1, 11, 0),
        duration: 1980,
        text: 'The team decides to position ClosedRoom on founders, consultants, and product teams working with sensitive material. The beta remains planned for July.',
        brief: 'Beta positioning focuses on local privacy, meeting intelligence, and time saving for small teams with sensitive material.',
        actions: [
          { task: 'Prepare a beta page with focus on local privacy', owner: 'Marta', due_date: 'Monday', priority: 'Medium', status: 'open' },
          { task: 'Collect ten target beta profiles', owner: 'Daniele', due_date: 'End of month', priority: 'Medium', status: 'open' },
        ],
        decisions: [
          { decision: 'Beta release remains scheduled for July.' },
          { decision: 'Main message will be retrieving decisions and actions without rereading transcripts.' },
        ],
        risks: [
          { risk: 'Lack of realistic data to show value in demo.', severity: 'Medium', next_step: 'Use coherent beta launch scenario.' },
        ],
      },
      {
        id: 'demo-technical-review',
        title: 'Technical review - Local Nemotron and performance',
        createdAt: isoDaysAgo(2, 16, 45),
        duration: 3120,
        text: 'The review confirms that local Nemotron and the managed sidecar are the right direction. It remains to measure startup, context, and fallback when the model is not ready.',
        brief: 'The local pipeline is valid, but the product must explain status and fallback without exposing runtime details to non-technical users.',
        actions: [
          { task: 'Measure sidecar startup on MacBook Air M-series', owner: 'Luca', due_date: 'Week', priority: 'Medium', status: 'open' },
          { task: 'Move runtime diagnostics under advanced settings', owner: 'Daniele', due_date: 'Next sprint', priority: 'Low', status: 'open' },
        ],
        decisions: [
          { decision: 'The local sidecar remains automatically managed in auto mode.' },
        ],
        risks: [
          { risk: 'Local model startup can seem like a block if the UI does not communicate progress.', severity: 'Medium', next_step: 'Use jobs and service center.' },
        ],
      },
    ];
  }
}

export function getDemoMeetings(lang = 'it'): Meeting[] {
  const specs = getMeetingSpecs(lang);
  return specs.map((spec) => {
    const rec = recording(spec.id, spec.title, spec.createdAt, {
      duration_seconds: spec.duration,
      bytes_written: Math.round(spec.duration * 18_500),
    });
    const tx = transcription(`tx-${spec.id}`, spec.id, spec.title, spec.createdAt, spec.text || '', lang);
    const runs = [
      run(
        `brief-${spec.id}`,
        spec.id,
        tx.id,
        'meeting_brief',
        spec.createdAt,
        { summary: spec.brief },
        lang === 'it' ? `# Brief del meeting\n\n**Sintesi**: ${spec.brief}` : `# Meeting brief\n\n**Summary**: ${spec.brief}`
      ),
      run(
        `actions-${spec.id}`,
        spec.id,
        tx.id,
        'action_items',
        spec.createdAt,
        { action_items: spec.actions },
        (lang === 'it' ? '# Azioni operative\n\n' : '# Action Items\n\n') +
          spec.actions.map(act => `- **${act.owner}**: ${act.task} (${lang === 'it' ? 'Scadenza' : 'Due'}: ${act.due_date}, ${lang === 'it' ? 'Priorità' : 'Priority'}: ${act.priority})`).join('\n')
      ),
      run(
        `decisions-${spec.id}`,
        spec.id,
        tx.id,
        'decisions',
        spec.createdAt,
        { decisions: spec.decisions },
        (lang === 'it' ? '# Decisioni recenti\n\n' : '# Recent Decisions\n\n') +
          spec.decisions.map(dec => `- **${dec.decision}**\n  *${lang === 'it' ? 'Razionale' : 'Rationale'}*: ${dec.rationale || (lang === 'it' ? 'N/D' : 'N/A')}`).join('\n')
      ),
      run(
        `risks-${spec.id}`,
        spec.id,
        tx.id,
        'risks_blockers',
        spec.createdAt,
        { risks: spec.risks },
        (lang === 'it' ? '# Rischi e blocchi\n\n' : '# Risks and Blockers\n\n') +
          spec.risks.map(rsk => `- **${rsk.risk}** (${lang === 'it' ? 'Severità' : 'Severity'}: ${rsk.severity})\n  *${lang === 'it' ? 'Prossimo passo' : 'Next step'}*: ${rsk.next_step}`).join('\n')
      ),
    ];
    return {
      id: spec.id,
      recording: rec,
      transcription: tx,
      analysis_runs: runs,
      latest_analysis: Object.fromEntries(runs.map((analysisRun) => [analysisRun.analysis_type, analysisRun])),
      jobs: [],
      status: 'ready',
      project_name: PROJECT_NAME,
      created_at: spec.createdAt,
      updated_at: spec.createdAt,
    };
  });
}

export function getDemoProjects(lang = 'it'): Project[] {
  const meetings = getDemoMeetings(lang);
  return [
    {
      name: PROJECT_NAME,
      is_unassigned: false,
      items: meetings.map((meeting) => ({
        recording: meeting.recording,
        transcription: meeting.transcription,
        analysis: null,
        analysis_runs: meeting.analysis_runs,
      })),
    },
  ];
}
