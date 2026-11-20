import { test, expect, dispatch, tabIdForUrl, extUrl } from './support';

test('finds saved recordings by name or starting host and opens the matching report', async ({ context, background, extensionId }) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 390, height: 844 });
  await panel.goto(extUrl(extensionId, 'sidepanel.html'));
  await expect(panel.getByText('No recordings yet.')).toBeVisible();

  const demo = await context.newPage();
  async function record(url: string, name: string) {
    await demo.goto(url);
    const tabId = await tabIdForUrl(background, url);
    const { session } = await dispatch<{ session: { id: string } }>(background, { kind: 'session/start', tabId });
    await dispatch(background, { kind: 'session/stop' });
    await dispatch(background, { kind: 'session/rename', sessionId: session.id, name });
    return session.id;
  }

  const first = await record('http://localhost:5319/?view=private-query', 'Checkout form');
  await record('http://127.0.0.1:5319/', 'Receipt layout');

  const search = panel.getByRole('searchbox', { name: 'Filter recordings by name or starting site' });
  const names = panel.locator('.session-row__name');
  await expect(names).toHaveText(['Receipt layout', 'Checkout form']);
  await search.fill('  ChEcKOut  ');
  await expect(names).toHaveText(['Checkout form']);
  await search.fill('127.0.0.1');
  await expect(names).toHaveText(['Receipt layout']);
  await search.fill('private-query');
  await expect(panel.getByRole('status')).toHaveText('No matching recordings.');
  await expect(names).toHaveCount(0);
  await search.fill('  ');
  await expect(names).toHaveText(['Receipt layout', 'Checkout form']);

  await search.fill('localhost');
  await expect(names).toHaveText(['Checkout form']);
  const opened = context.waitForEvent('page');
  await panel.getByRole('button', { name: /^Checkout form/ }).click();
  await expect(await opened).toHaveURL(extUrl(extensionId, `share.html?session=${first}`));
});
