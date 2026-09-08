import { analyze } from './inference.ts';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (value: unknown) => void;
};
scope.onmessage = (event) => {
  try {
    const result = analyze(
      event.data.study,
      event.data.settings,
      (done, total) => scope.postMessage({ type: 'progress', done, total }),
    );
    scope.postMessage({ type: 'result', result });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Analysis failed.',
    });
  }
};
