// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionList } from '@/entrypoints/sidepanel/components/SessionList';
import { useSessionList } from '@/entrypoints/sidepanel/components/useSessionList';
import { DEFAULT_SETTINGS } from './settings';
import type { Session } from './types';

vi.mock('@/entrypoints/sidepanel/components/useSessionList');

function session(id: string, name: string, initialUrl: string): Session {
  return {
    id, name, initialUrl,
    startedAt: 1000, endedAt: 2000,
    tabs: [], settings: DEFAULT_SETTINGS, status: 'stopped', counts: {}, assetBytes: 0,
  };
}

const saved = [
  session('one', 'Checkout form', 'https://shop.example/cart?view=internal-only'),
  session('two', 'Layout regression', 'https://docs.example/checkout'),
  session('old', 'Old recording', ''),
];
let host: HTMLDivElement;
let root: Root;
const open = vi.fn();
const remove = vi.fn();

function render(sessions: Session[] = saved) {
  vi.mocked(useSessionList).mockReturnValue({ sessions, loading: false, remove, now: 2000 });
  act(() => root.render(<SessionList onOpen={open} />));
}

function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type=search]')!;
  act(() => {
    input.value = value;
    Simulate.change(input);
  });
}

const names = () => Array.from(host.querySelectorAll('.session-row__name'), (item) => item.textContent);

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('finds names and starting hosts, ignoring case, URL paths and query strings', () => {
  render();
  search('  ChEcKOut  ');
  expect(names()).toEqual(['Checkout form']);
  search('DOCS.EXAMPLE');
  expect(names()).toEqual(['Layout regression']);
  search('internal-only');
  expect(names()).toEqual([]);
  expect(host.querySelector('[role=status]')?.textContent).toBe('No matching recordings.');
  search('  ');
  expect(names()).toEqual(saved.map((item) => item.name));
});

it('shows every recording from a matching host in list order', () => {
  const anotherMatch = session('three', 'Cart summary', 'https://shop.example/summary');
  render([saved[0]!, saved[1]!, anotherMatch]);
  search('  SHOP.EXAMPLE  ');
  expect(names()).toEqual(['Checkout form', 'Cart summary']);
});

it('opens and removes the matched recording by ID after a list refresh', () => {
  render();
  search('renamed');
  expect(names()).toEqual([]);
  render([saved[0]!, { ...saved[1]!, name: 'Renamed report' }]);
  expect(names()).toEqual(['Renamed report']);
  act(() => host.querySelector<HTMLButtonElement>('.session-row__main')!.click());
  act(() => host.querySelector<HTMLButtonElement>('.session-row__delete')!.click());
  expect(open).toHaveBeenCalledWith('two');
  expect(remove).toHaveBeenCalledWith('two');
});

it('keeps recordings with a missing or invalid starting URL searchable by name', () => {
  render([saved[2]!, session('broken', 'Imported recording', 'invalid URL')]);
  search('example');
  expect(names()).toEqual([]);
  search('old');
  expect(names()).toEqual(['Old recording']);
  render([]);
  expect(host.textContent).toContain('No recordings yet.');
  expect(host.querySelector('input')).toBeNull();
});
