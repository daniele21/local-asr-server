import type { Transcription } from '../../api/apiClient';
import { getDemoMeetings } from '../demo/demoData';

export function getTourTranscription(lang: string): Transcription {
  const meeting = getDemoMeetings(lang)[0];
  return meeting.transcription!;
}

export function getTourAnalysis(lang: string) {
  const meeting = getDemoMeetings(lang)[0];
  const brief = meeting.latest_analysis.meeting_brief;
  const actions = meeting.latest_analysis.action_items?.result?.action_items as Array<{ owner?: string; task?: string; due_date?: string }> | undefined;
  const decisions = meeting.latest_analysis.decisions?.result?.decisions as Array<{ decision?: string }> | undefined;

  return {
    title: meeting.recording.title,
    summary: String(brief?.result?.summary || ''),
    key_points: (decisions || []).map((item) => item.decision || '').filter(Boolean),
    action_items: (actions || []).map((item) =>
      [item.owner, item.task, item.due_date].filter(Boolean).join(' · '),
    ),
  };
}
