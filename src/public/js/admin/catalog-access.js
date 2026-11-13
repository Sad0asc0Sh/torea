'use strict';

(function () {
  const tree = document.querySelector('.tree-list--catalog');
  if (!tree) return;

  const getVisibleCheckbox = (li) =>
    (li && li.querySelector(':scope > .tree-row input[data-visible]')) || null;

  function applyToggle(toggle, expanded, children) {
    if (!toggle || !children) return;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.textContent = expanded ? '−' : '+';
    children.hidden = !expanded;
  }

  function initToggles() {
    tree.querySelectorAll('.tree-toggle[data-toggle]').forEach((toggle) => {
      const li = toggle.closest('li.tree-item');
      const children = li ? li.querySelector(':scope > ul.tree-children') : null;
      if (!children) return;
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      applyToggle(toggle, expanded, children);
      toggle.addEventListener('click', function () {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        applyToggle(toggle, !isExpanded, children);
      });
    });
  }

  function refreshParentState(li) {
    const parent = li && li.parentElement ? li.parentElement.closest('li.tree-item') : null;
    if (!parent) return;
    const parentVisible = getVisibleCheckbox(parent);
    if (parentVisible) {
      const childCbs = Array.from(
        parent.querySelectorAll(':scope > ul.tree-children > li.tree-item > .tree-row input[data-visible]')
      );
      if (childCbs.length) {
        const states = childCbs.map((cb) => cb.checked);
        const allChecked = states.every(Boolean);
        const noneChecked = states.every((v) => !v);
        parentVisible.indeterminate = !allChecked && !noneChecked;
      }
    }
    refreshParentState(parent);
  }

  function initializeStates() {
    const items = Array.from(tree.querySelectorAll('li.tree-item'));
    items.reverse().forEach((li) => refreshParentState(li));
  }

  tree.addEventListener('change', (ev) => {
    const target = ev.target;
    if (target.matches('input[data-visible]')) {
      const li = target.closest('li.tree-item');
       refreshParentState(li);
    }
  });

  tree.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-apply-children]');
    if (!btn) return;
    const li = btn.closest('li.tree-item');
    if (!li) return;
    const action = btn.dataset.applyChildren;
    const shouldCheck = action === 'grant';
    const descendants = li.querySelectorAll('ul.tree-children input[data-visible]');
    descendants.forEach((cb) => {
      if (cb.dataset.adminLocked === '1') return;
      cb.checked = shouldCheck;
      cb.indeterminate = false;
    });
    refreshParentState(li);
  });

  initToggles();
  initializeStates();
})();
