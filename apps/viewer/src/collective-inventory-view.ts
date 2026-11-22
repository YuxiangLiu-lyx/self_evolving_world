import {
  personalInventoryHistory,
  personalInventoryResult,
} from '@self-evolving-world/world-core';
import type { V7Actor, V7World } from '@self-evolving-world/world-core';
export function appendInventoryInspection(
  parent: HTMLElement,
  w: V7World,
  a: V7Actor,
) {
  const latest = personalInventoryResult(w, a);
  if (!latest) return;
  const history = personalInventoryHistory(w, a),
    entries = history.length ? history : [latest];
  const panel = document.createElement('section');
  panel.className = 'inventory-inspection-panel';
  const title = document.createElement('h4');
  title.textContent = 'Recorded personal inventory inspection';
  const pick = document.createElement('select');
  pick.ariaLabel = 'Recorded inventory read';
  entries.forEach((r, i) => {
    pick.add(
      new Option(
        `Round ${String(Number(r.tick))} · ${r.mode === 'item' ? 'exact item' : 'page ' + String(Number(r.page) + 1)}`,
        String(i),
      ),
    );
  });
  pick.value = String(entries.length - 1);
  const body = document.createElement('div'),
    controls = document.createElement('div'),
    previous = document.createElement('button'),
    next = document.createElement('button');
  previous.textContent = 'Previous recorded page';
  next.textContent = 'Next recorded page';
  controls.append(previous, next);
  const render = () => {
    const r = entries[Number(pick.value)];
    if (!r) return;
    body.replaceChildren();
    const status = document.createElement('p');
    status.textContent = `Recorded at round ${String(Number(r.tick))} · ${typeof r.inventoryRevision === 'string' ? r.inventoryRevision : ''} · Page ${String(Number(r.page) + 1)} / ${String(Number(r.totalPages))} · ${String(Number(r.totalItems))} carried stacks · ${String(Number(r.omittedItems))} outside this result`;
    const warning = document.createElement('p');
    warning.textContent = r.revisionChanged
      ? 'Holdings changed since the previous inspection; earlier pages may be stale.'
      : 'Execution-time record. Later world changes do not rewrite this page.';
    body.append(status, warning);
    if (r.unavailable) {
      const message = document.createElement('p');
      message.textContent =
        'Unavailable in this personal carried inventory. No other ownership or location is disclosed.';
      body.append(message);
    }
    const items = Array.isArray(r.items) ? r.items : [];
    for (const row of items) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const item = row;
      const line = document.createElement('p'),
        id = document.createElement('input');
      id.readOnly = true;
      id.ariaLabel = 'Recorded item identity';
      id.value = typeof item.id === 'string' ? item.id : '';
      id.addEventListener('click', () => {
        id.select();
      });
      id.style.width = '100%';
      const text = document.createElement('span');
      text.textContent = `${String(Number(item.quantity))} ${typeof item.resource === 'string' ? item.resource : ''} · ${item.available ? 'available' : 'reserved'} · represented form ${JSON.stringify(item.form)}`;
      line.append(id, text);
      body.append(line);
    }
    const index = (delta: number) =>
      entries.findIndex(
        (candidate) =>
          candidate.mode === 'page' &&
          candidate.inventoryRevision === r.inventoryRevision &&
          candidate.page === Number(r.page) + delta,
      );
    previous.disabled = r.mode !== 'page' || index(-1) < 0;
    next.disabled = r.mode !== 'page' || index(1) < 0;
    previous.title = previous.disabled
      ? 'That page has no recorded inspection in this frame.'
      : '';
    next.title = next.disabled
      ? 'That page has no recorded inspection in this frame.'
      : '';
    previous.onclick = () => {
      pick.value = String(index(-1));
      render();
    };
    next.onclick = () => {
      pick.value = String(index(1));
      render();
    };
  };
  pick.addEventListener('change', render);
  panel.append(title, pick, controls, body);
  parent.append(panel);
  render();
}
