import { useState, useEffect } from 'react';
import { ApiClient, Project, Recording, ProjectItem } from '../api/apiClient';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProjectPromptModal } from '../components/ui/ProjectPromptModal';
import { formatBytes, formatDuration, formatProjectDate } from '../utils/formatters';

interface ProjectsPageProps {
  navigateTo: (page: string, detail?: string | null) => void;
}

export default function ProjectsPage({ navigateTo }: ProjectsPageProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editingRecordingId, setEditingRecordingId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [activeRecordingForProject, setActiveRecordingForProject] = useState<Recording | null>(null);
  const [existingProjectsList, setExistingProjectsList] = useState<string[]>([]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.listProjects();
      setProjects(data.items || []);
    } catch (err: any) {
      showToast(err.message || 'Errore nel caricamento dei progetti', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [t]);

  const handleRenameClick = (recording: Recording) => {
    setEditingRecordingId(recording.id);
    setEditTitleValue(recording.title);
  };

  const handleSaveRename = async (recording: Recording) => {
    const title = editTitleValue.trim();
    if (!title) {
      showToast(t('transcription.titleEmptyError'), 'error');
      return;
    }

    try {
      await ApiClient.updateRecording(recording.id, { title });
      showToast(t('transcription.titleSaveSuccess'), 'success');
      setEditingRecordingId(null);
      loadProjects();
    } catch (err: any) {
      showToast(t('transcription.titleSaveError', { error: err.message }), 'error');
    }
  };

  const handleAssignProject = async (recording: Recording) => {
    let list: string[] = [];
    try {
      const projsData = await ApiClient.listProjects();
      list = (projsData.items || [])
        .filter((p) => !p.is_unassigned)
        .map((p) => p.name);
    } catch {}

    setExistingProjectsList(list);
    setActiveRecordingForProject(recording);
    setIsProjectModalOpen(true);
  };

  const handleConfirmProject = async (projectName: string) => {
    if (!activeRecordingForProject) return;
    try {
      await ApiClient.updateRecording(activeRecordingForProject.id, { project_name: projectName });
      showToast(t('transcription.projectUpdateSuccess'), 'success');
      setIsProjectModalOpen(false);
      setActiveRecordingForProject(null);
      loadProjects();
    } catch (err: any) {
      showToast(t('transcription.projectUpdateError', { error: err.message }), 'error');
    }
  };

  const handlePlayRecording = async (recording: Recording) => {
    navigateTo('transcription', `file-${recording.id}`);
  };



  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <span className="text-text-secondary text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border-subtle pb-3">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('projects.title')}</span>
        <h2 className="text-2xl font-bold text-text-primary mt-1">{t('projects.heading')}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('projects.body')}</p>
      </div>

      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-text-muted">{t('projects.empty')}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {projects.map((project, idx) => (
            <section key={idx} className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-subtle/55 pb-1 gap-2">
                <div>
                  <span className="text-[10px] font-bold text-accent tracking-wider uppercase">
                    {project.is_unassigned ? (lang === 'it' ? 'DA ORGANIZZARE' : 'UNASSIGNED') : t('projects.title').toUpperCase()}
                  </span>
                  <h3 className="text-base font-bold text-text-primary mt-0.5">{project.name}</h3>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted font-medium">
                  <span>{project.items.length} audio</span>
                  <span>·</span>
                  <span>{project.items.filter((i) => i.transcription).length} {t('projects.transcription').toLowerCase()}</span>
                  <span>·</span>
                  <span>{project.items.filter((i) => i.analysis).length} {t('projects.analysis').toLowerCase()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.items.map((item: ProjectItem, recordIdx: number) => {
                  const recording = item.recording;
                  const isEditing = editingRecordingId === recording.id;

                  // Find duration
                  const durationSeconds = recording.duration_seconds || recording.duration || recording.metadata?.duration_seconds || recording.metadata?.duration || 0;

                  return (
                    <Card key={recordIdx} className="flex flex-col justify-between gap-4 border-border-subtle/40 hover:border-border-focus/20 transition-colors">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <input
                                  type="text"
                                  className="w-full px-3 py-1.5 bg-bg-surface border border-border-focus rounded-lg text-sm focus:outline-none"
                                  value={editTitleValue}
                                  onChange={(e) => setEditTitleValue(e.target.value)}
                                  maxLength={200}
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleSaveRename(recording)}>
                                    Salva
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingRecordingId(null)}>
                                    {t('common.cancel')}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-text-primary truncate">{recording.title}</h4>
                                <button
                                  onClick={() => handleRenameClick(recording)}
                                  className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                                  title="Rinomina"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => handleAssignProject(recording)}>
                            {t('recording.btnProject')}
                          </Button>
                        </div>

                        {/* Metadata rows */}
                        <div className="flex flex-col gap-1 text-[11px] text-text-secondary leading-relaxed">
                          <div className="flex items-center gap-2">
                            <span>📅</span>
                            <span>{t('recording.metaDate')}:</span>
                            <strong className="text-text-primary">{formatProjectDate(recording.created_at, lang)}</strong>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>⏱</span>
                            <span>{t('recording.metaDuration')}:</span>
                            <strong className="text-text-primary">{formatDuration(durationSeconds, t)}</strong>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>💾</span>
                            <span>{t('recording.metaSize')}:</span>
                            <strong className="text-text-primary">{formatBytes(recording.bytes_written || 0)}</strong>
                          </div>
                        </div>

                        {/* Project sub-statuses */}
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                            item.transcription ? 'border-success/30 bg-success/5 text-success' : 'border-border-subtle bg-bg-surface/30 text-text-muted'
                          }`}>
                            📝 {item.transcription ? t('recording.statusTranscribed') : t('recording.statusNotTranscribed')}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                            item.analysis ? 'border-success/30 bg-success/5 text-success' : 'border-border-subtle bg-bg-surface/30 text-text-muted'
                          }`}>
                            🧠 {item.analysis ? t('recording.statusAnalyzed') : t('recording.statusNotAnalyzed')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t border-border-subtle/40 pt-3 mt-1">
                        <Button size="sm" className="flex-1" onClick={() => navigateTo('recording', recording.id)}>
                          {lang === 'it' ? 'Apri vista' : 'Open project view'}
                        </Button>
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => handlePlayRecording(recording)}>
                          {lang === 'it' ? 'Vai a trascrizione' : 'Go to transcribe'}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      <ProjectPromptModal
        isOpen={isProjectModalOpen}
        initialValue={activeRecordingForProject?.project_name || ''}
        onConfirm={handleConfirmProject}
        onCancel={() => {
          setIsProjectModalOpen(false);
          setActiveRecordingForProject(null);
        }}
        existingProjects={existingProjectsList}
      />
    </div>
  );
}
