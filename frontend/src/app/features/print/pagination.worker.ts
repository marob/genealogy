/// <reference lib="webworker" />

import { type LayoutInput, layoutPages } from './pagination';

/** Print page splitting off the main thread. */
addEventListener('message', ({ data }: MessageEvent<LayoutInput>) => {
  postMessage(layoutPages(data));
});
