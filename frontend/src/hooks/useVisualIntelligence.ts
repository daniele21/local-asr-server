import { useEffect, useState } from 'react';
import { ApiClient } from '../api/apiClient';
import { VisualIntelligenceResponseV2 } from '../api/visualIntelligence';

export function useVisualIntelligence(recordingId: string | null, enabled: boolean) {
  const [data, setData] = useState<VisualIntelligenceResponseV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    if (!recordingId || !enabled) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    ApiClient.visualIntelligenceV2(recordingId, controller.signal)
      .then((response) => setData(response))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [recordingId, enabled]);

  return { data, loading, error };
}
