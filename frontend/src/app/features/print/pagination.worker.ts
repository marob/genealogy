/// <reference lib="webworker" />

import { type LayoutInput, layoutPages } from './pagination';

/** Découpage des pages d'impression hors du fil principal. */
addEventListener('message', ({ data }: MessageEvent<LayoutInput>) => {
  postMessage(layoutPages(data));
});
