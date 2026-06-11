import { useEffect, useState } from 'react';
import { subscribeProject } from '../ws/socket';
import type { ProgressEvent } from '@shared/job';

export function useProgress(projectId: string | null): {
  progress: number;
  stage: ProgressEvent['stage'] | null;
  message: string;
  events: ProgressEvent[];
} {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<ProgressEvent['stage'] | null>(null);
  const [message, setMessage] = useState('');
  const [events, setEvents] = useState<ProgressEvent[]>([]);

  useEffect(() => {
    if (!projectId) return;
    const unsub = subscribeProject(projectId, (ev) => {
      const e = ev as ProgressEvent;
      setProgress(e.progress);
      setStage(e.stage);
      setMessage(e.message);
      setEvents((prev) => [...prev, e]);
    });
    return unsub;
  }, [projectId]);

  return { progress, stage, message, events };
}
