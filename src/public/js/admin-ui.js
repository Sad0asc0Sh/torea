(() => {
  /**
   * UI sizing constants for small-screen admin buttons and tables.
   */
  const MIN_FONT_PX = 7; // minimum readable size for button labels on small screens
  const MAX_AUTOFIT_STEPS = 12; // binary search depth for autofit sizing
  const ACTION_HEADER_KEYS = ['عملیات', 'action'];

  function ensureButtonLabel(btn) {
    if (!btn) return null;
    const existing = btn.querySelector('.btn-label');
    if (existing) return existing;

    const textNodes = Array.from(btn.childNodes).filter(function(node) {
      return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
    });

    if (!textNodes.length) return null;

    const label = document.createElement('span');
    label.className = 'btn-label';
    label.textContent = textNodes.map(function(node){ return node.textContent; }).join(' ').trim();
    textNodes.forEach(function(node){ node.remove(); });
    btn.appendChild(label);
    return label;
  }

  function autoFitButtons(root) {
    const scope = root || document;
    scope.querySelectorAll('.btn').forEach(function(btn){
      const label = btn.querySelector('.btn-label') || ensureButtonLabel(btn);
      if (!label) return;

      if (!btn.dataset.autofit) btn.dataset.autofit = '1';
      if (!btn.title && label.textContent.trim()) btn.title = label.textContent.trim();
      if (btn.dataset.autofit !== '1') return;

      const style = window.getComputedStyle(label);
      const computedSize = parseFloat(style.fontSize) || 12;
      let low = MIN_FONT_PX;
      let high = computedSize;
      let best = computedSize;
      label.style.fontSize = computedSize + 'px';

      for (let i = 0; i < MAX_AUTOFIT_STEPS; i += 1) {
        const mid = (low + high) / 2;
        label.style.fontSize = mid + 'px';
        if (label.scrollWidth > label.clientWidth) {
          high = mid;
        } else {
          best = mid;
          low = mid;
        }
        if (Math.abs(high - low) < 0.1) break;
      }

      label.style.fontSize = best + 'px';
    });
  }

  function buildDetailsRow(row, hiddenIdx, headCells) {
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'row-details';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = row.children.length;

    const list = document.createElement('dl');
    hiddenIdx.forEach(function(idx){
      const key = headCells[idx] ? headCells[idx].textContent.trim() : '';
      const dt = document.createElement('dt');
      dt.textContent = key || 'جزئیات';
      const dd = document.createElement('dd');
      const targetCell = row.children[idx];
      const rendered = targetCell ? targetCell.innerText.trim() : '';
      dd.textContent = rendered || '—';
      list.appendChild(dt);
      list.appendChild(dd);
    });

    detailsCell.appendChild(list);
    detailsRow.appendChild(detailsCell);
    return detailsRow;
  }

  function attachToggle(row, hiddenIdx, headCells, table, actionIndex) {
    if (!hiddenIdx.length) return;
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn-secondary row-toggle';
    toggleBtn.dataset.autofit = '1';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">⌄</span><span class="btn-label">جزئیات</span>';
    toggleBtn.title = 'نمایش جزئیات';

    let targetCell = (actionIndex >= 0 && row.children[actionIndex]) ? row.children[actionIndex] : null;
    if (!targetCell) {
      targetCell = document.createElement('td');
      row.appendChild(targetCell);
    }
    targetCell.prepend(toggleBtn);

    toggleBtn.addEventListener('click', function(){
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      const nextRow = row.nextElementSibling;
      if (isExpanded) {
        if (nextRow && nextRow.classList.contains('row-details')) nextRow.remove();
        toggleBtn.setAttribute('aria-expanded', 'false');
        row.classList.remove('is-expanded');
        return;
      }
      if (nextRow && nextRow.classList.contains('row-details')) nextRow.remove();

      const detailsRow = buildDetailsRow(row, hiddenIdx, headCells);
      row.insertAdjacentElement('afterend', detailsRow);
      toggleBtn.setAttribute('aria-expanded', 'true');
      row.classList.add('is-expanded');
      autoFitButtons(row.closest('.admin-ui') || document);
    });
  }

  function setupCollapsibleTables(root) {
    const scope = root || document;
    scope.querySelectorAll('table.table').forEach(function(table){
      if (table.dataset.collapsibleInit === '1') return;
      table.dataset.collapsibleInit = '1';

      const headCells = Array.from(table.querySelectorAll('thead th'));
      if (!headCells.length) return;

      let actionIndex = headCells.findIndex(function(th){
        return (th.dataset && (th.dataset.action === 'true' || th.dataset.actionColumn === 'true'));
      });
      if (actionIndex < 0) {
        actionIndex = headCells.findIndex(function(th){
          const text = (th.textContent || '').trim().toLowerCase();
          return ACTION_HEADER_KEYS.some(function(key){ return text.indexOf(key.toLowerCase()) !== -1; });
        });
      }
      if (actionIndex < 0 && headCells.length) {
        const lastIdx = headCells.length - 1;
        const lastText = (headCells[lastIdx].textContent || '').trim();
        if (!lastText) actionIndex = lastIdx;
      }

      const visibleIdx = [];
      headCells.forEach(function(_, idx){
        if (idx < 3) visibleIdx.push(idx);
      });
      if (actionIndex >= 0 && !visibleIdx.includes(actionIndex)) visibleIdx.push(actionIndex);

      const hiddenIdx = headCells.map(function(_, idx){ return idx; }).filter(function(idx){
        return !visibleIdx.includes(idx);
      });

      if (!hiddenIdx.length) {
        table.classList.remove('table-collapsible', 'is-collapsed');
        return;
      }

      table.classList.add('table-collapsible', 'is-collapsed');

      hiddenIdx.forEach(function(idx){
        if (headCells[idx]) headCells[idx].classList.add('is-hidden-col');
      });

      const bodyRows = Array.from(table.querySelectorAll('tbody tr')).filter(function(r){
        return !r.classList.contains('row-details');
      });

      bodyRows.forEach(function(row){
        Array.from(row.children).forEach(function(cell, idx){
          if (hiddenIdx.includes(idx)) cell.classList.add('is-hidden-col');
        });
        attachToggle(row, hiddenIdx, headCells, table, actionIndex);
      });
    });
  }

  function injectSettingsMenu() {
    const menu = document.querySelector('.drawer-menu');
    if (!menu || menu.dataset.settingsInjected === '1') return;
    if (menu.querySelector('[data-settings-group="1"], a[href="/admin/settings"]')) {
      menu.dataset.settingsInjected = '1';
      return;
    }

    const pathname = (window.location && window.location.pathname) || '';
    const isSettings = pathname === '/admin/settings';
    const isApis = pathname.indexOf('/admin/settings/apis') === 0;
    const wrapper = document.createElement('li');
    wrapper.className = 'drawer-menu-item';
    wrapper.dataset.settingsGroup = '1';

    const details = document.createElement('details');
    details.className = 'drawer-details';
    if (isSettings || isApis) details.setAttribute('open', 'open');

    const summary = document.createElement('summary');
    summary.className = 'drawer-menu-link drawer-menu-summary' + ((isSettings || isApis) ? ' active' : '');
    summary.innerHTML = '<span>تنظیمات</span><span class="drawer-menu-chevron" aria-hidden="true"></span>';

    const submenu = document.createElement('ul');
    submenu.className = 'drawer-submenu';

    const settingsItem = document.createElement('li');
    settingsItem.innerHTML = '<a href="/admin/settings" class="drawer-menu-link ' + (isSettings ? 'active' : '') + '"><span>تنظیمات</span></a>';
    const apisItem = document.createElement('li');
    apisItem.innerHTML = '<a href="/admin/settings/apis" class="drawer-menu-link ' + (isApis ? 'active' : '') + '"><span>اتصال API ها</span></a>';

    submenu.appendChild(settingsItem);
    submenu.appendChild(apisItem);
    details.appendChild(summary);
    details.appendChild(submenu);
    wrapper.appendChild(details);
    menu.appendChild(wrapper);
    menu.dataset.settingsInjected = '1';
  }

  document.addEventListener('DOMContentLoaded', function(){
    const adminRoot = document.querySelector('.admin-ui');
    if (!adminRoot) return;
    autoFitButtons(adminRoot);
    setupCollapsibleTables(adminRoot);
    injectSettingsMenu();
  });
})();
