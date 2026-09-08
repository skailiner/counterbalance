import {
  validateStudy,
  validateSettings,
  type Study,
  type Settings,
} from './study.ts';
import type { Result } from './inference.ts';
export type WorkerLike = {
  onmessage: ((e: MessageEvent) => unknown) | null;
  onerror: ((e: ErrorEvent) => unknown) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  terminate: () => void;
};
export class AnalysisRunner {
  private active: {
    worker: WorkerLike;
    reject: (error: Error) => void;
  } | null = null;
  private disposed = false;
  private factory: () => WorkerLike;
  constructor(factory: () => WorkerLike) {
    this.factory = factory;
  }
  get busy() {
    return this.active !== null;
  }
  run(
    studyInput: Study,
    settingsInput: Settings,
    progress: (done: number, total: number) => void,
  ): Promise<Result> {
    if (this.disposed)
      return Promise.reject(new Error('This workspace is closed.'));
    if (this.busy)
      return Promise.reject(new Error('Another analysis is running.'));
    let study: Study, settings: Settings;
    try {
      study = validateStudy(studyInput);
      settings = validateSettings(settingsInput);
    } catch (e) {
      return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
      let worker: WorkerLike;
      try {
        worker = this.factory();
      } catch {
        reject(
          new Error(
            'The analysis worker could not start. Reload in a current browser.',
          ),
        );
        return;
      }
      const active = { worker, reject };
      this.active = active;
      const finish = (result?: Result, error?: Error) => {
        if (this.active !== active) return;
        this.active = null;
        worker.terminate();
        worker.onmessage = null;
        worker.onerror = null;
        if (error) reject(error);
        else resolve(result!);
      };
      worker.onmessage = (e) => {
        if (this.active !== active) return;
        const data = e.data;
        if (data?.type === 'progress') {
          progress(data.done, data.total);
          return;
        }
        if (
          data?.type === 'result' &&
          data.result?.engine === 'counterbalance-rational-v1'
        ) {
          finish(data.result);
          return;
        }
        finish(
          undefined,
          new Error(
            data?.type === 'error' && typeof data.message === 'string'
              ? data.message
              : 'Unexpected worker response.',
          ),
        );
      };
      worker.onerror = () =>
        finish(
          undefined,
          new Error(
            'Analysis stopped unexpectedly. Your previous study and result are unchanged.',
          ),
        );
      try {
        worker.postMessage({ study, settings }, []);
      } catch {
        finish(
          undefined,
          new Error('Could not send this study to the analysis worker.'),
        );
      }
    });
  }
  cancel() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.worker.terminate();
    a.worker.onmessage = null;
    a.worker.onerror = null;
    a.reject(
      new Error('Analysis cancelled. Previous data and results are unchanged.'),
    );
  }
  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
