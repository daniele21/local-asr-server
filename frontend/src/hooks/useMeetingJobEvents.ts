import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Meeting, TranscriptionJob } from '../api/apiClient';
import { followJobEvents } from '../api/jobEvents';

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running', 'waiting_for_service', 'retrying', 'cancelling']);

function activeMeetingJobIds(meeting: Meeting | null): string[] {
  if (!meeting) return [];
  const ids = new Set<string>();
  for (const job of meeting.jobs || []) {
    if (ACTIVE_JOB_STATUSES.has(job.status)) ids.add(job.id);
  }
  for (const run of meeting.analysis_runs || []) {
    if (run.job_id && ACTIVE_JOB_STATUSES.has(run.status)) ids.add(run.job_id);
  }
  return Array.from(ids).sort();
}

function applyJobUpdate(meeting: Meeting, job: TranscriptionJob): Meeting {
  const jobs = (meeting.jobs || []).map((current) => current.id === job.id ? { ...current, ...job } : current);
  const analysisRuns = (meeting.analysis_runs || []).map((run) => (
    run.job_id === job.id ? { ...run, status: job.status } : run
  ));
  return {
    ...meeting,
    jobs,
    analysis_runs: analysisRuns,
  };
}

/** Keep active Meeting processing event-driven; terminal events reload canonical persisted state. */
export function useMeetingJobEvents(
  meeting: Meeting | null,
  setMeeting: Dispatch<SetStateAction<Meeting | null>>,
  reload: () => Promise<void>,
): void {
  const setMeetingRef = useRef(setMeeting);
  const reloadRef = useRef(reload);
  setMeetingRef.current = setMeeting;
  reloadRef.current = reload;

  const jobIdsKey = useMemo(() => activeMeetingJobIds(meeting).join('|'), [meeting]);

  useEffect(() => {
    if (!jobIdsKey) return;
    const jobIds = jobIdsKey.split('|');
    const cleanups = jobIds.map((jobId) => followJobEvents(jobId, {
      onUpdate: (job) => {
        setMeetingRef.current((current) => current ? applyJobUpdate(current, job) : current);
      },
      onTerminal: () => {
        void reloadRef.current();
      },
    }));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [jobIdsKey]);
}
