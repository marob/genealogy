/// <reference lib="webworker" />

import { type LayoutInput, layoutPages } from './pagination';

/** Print page splitting off the main thread; a failure is reported as `{ error }`. */
addEventListener('message', ({ data }: MessageEvent<LayoutInput>) => {
  try {
    postMessage(layoutPages(data));
  } catch (error) {
    postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
