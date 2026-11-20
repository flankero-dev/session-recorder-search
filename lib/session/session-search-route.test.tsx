// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/sidepanel/App';
import { broadcast } from '@/lib/messaging';
import { DEFAULT_SETTINGS } from './settings';
import type { Session } from './types';

function session(id: string, name: string, initialUrl: string): Session {
  return {
    id, name, initialUrl,
    startedAt: 1000, endedAt: 2000, status: 'stopped',
    tabs: [], settings: DEFAULT_SETTINGS, counts: {}, assetBytes: 0,
  };
}

it('opens the matching report after a rename arrives while the search is active', async () => {
  const purchase = session('purchase', 'Checkout form', 'https://shop.example/cart');
  const docs = session('docs', 'Receipt layout', 'https://docs.example/guide');
  let sessions = [purchase, docs];
  type RuntimeListener = (message: Record<string, unknown>) => void;
  const listeners = new Set<RuntimeListener>();
  const createTab = vi.fn(async () => undefined);
  const idle = {
    session: null, recentEvents: [], attachedTabIds: [], recording: false,
    paused: false, micOn: false, videoOn: false, annotating: false, pointing: false,
  };
  const sendMessage = vi.fn(async (message: Record<string, unknown>) => {
    if (message.__sr_broadcast__) {
      for (const listener of listeners) listener(message);
      return undefined;
    }
    if (message.kind === 'session/getState') return idle;
    if (message.kind === 'session/list') return { sessions };
    throw new Error(`Unexpected extension message: ${message.kind}`);
  });

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (listener: RuntimeListener) => listeners.add(listener),
        removeListener: (listener: RuntimeListener) => listeners.delete(listener),
      },
      getURL: (path: string) => `chrome-extension://test-recorder/${path}`,
    },
    storage: {
      local: { get: async () => ({}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: { create: createTab },
  });

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const names = () => Array.from(host.querySelectorAll('.session-row__name'), (item) => item.textContent);
  try {
    await act(async () => root.render(<App />));
    expect(names()).toEqual(['Checkout form', 'Receipt layout']);
    const filter = host.querySelector<HTMLInputElement>('input[type=search]')!;
    act(() => {
      filter.value = '  ReGrEsSiOn  ';
      Simulate.change(filter);
    });
    expect(host.querySelector('[role=status]')?.textContent).toBe('No matching recordings.');

    const renamed = { ...docs, name: 'Receipt regression' };
    sessions = [purchase, renamed];
    await act(async () => broadcast({ kind: 'session/updated', session: renamed }));
    expect(names()).toEqual(['Receipt regression']);
    act(() => host.querySelector<HTMLButtonElement>('.session-row__main')!.click());
    expect(createTab).toHaveBeenCalledExactlyOnceWith({ url: 'chrome-extension://test-recorder/share.html?session=docs' });
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
