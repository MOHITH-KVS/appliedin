// AppliedIn - Popup Script

document.addEventListener('DOMContentLoaded', function () {

  let allApplications = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let currentExportType = ''; // 'csv' or 'excel'

  // ── Load Applications ──
  function loadApplications() {
    chrome.storage.local.get(['applications'], function (result) {
      allApplications = result.applications || [];
      updateStats();
      renderApplications();
    });
  }

  loadApplications();

  // ── Update Stats ──
  function updateStats() {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    document.getElementById('statToday').textContent =
      allApplications.filter(a => new Date(a.date) >= todayStart).length;

    document.getElementById('statYesterday').textContent =
      allApplications.filter(a => {
        const d = new Date(a.date);
        return d >= yesterdayStart && d < todayStart;
      }).length;

    document.getElementById('statWeek').textContent =
      allApplications.filter(a => new Date(a.date) >= weekStart).length;

    document.getElementById('statMonth').textContent =
      allApplications.filter(a => new Date(a.date) >= monthStart).length;

    document.getElementById('totalCount').textContent =
      `${allApplications.length} Total`;
  }

  // ── Filter by Period ──
  function filterByPeriod(period) {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    switch (period) {
      case 'today':
        return allApplications.filter(a => new Date(a.date) >= todayStart);
      case 'yesterday':
        return allApplications.filter(a => {
          const d = new Date(a.date);
          return d >= yesterdayStart && d < todayStart;
        });
      case 'week':
        return allApplications.filter(a => new Date(a.date) >= weekStart);
      case 'month':
        return allApplications.filter(a => new Date(a.date) >= monthStart);
      case 'year':
        return allApplications.filter(a => new Date(a.date) >= yearStart);
      case 'all':
      default:
        return allApplications;
    }
  }

  // ── Render Applications ──
  function renderApplications() {
    const list = document.getElementById('applicationsList');
    const emptyState = document.getElementById('emptyState');

    let filtered = allApplications;

    if (currentFilter !== 'all') {
      filtered = filtered.filter(app => app.status === currentFilter);
    }

    if (currentSearch.trim() !== '') {
      const query = currentSearch.toLowerCase();
      filtered = filtered.filter(app =>
        app.company.toLowerCase().includes(query) ||
        app.role.toLowerCase().includes(query) ||
        (app.platform && app.platform.toLowerCase().includes(query)) ||
        (app.location && app.location.toLowerCase().includes(query))
      );
    }

    list.innerHTML = '';

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      list.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    list.style.display = 'flex';

    filtered.forEach(function (app) {
      const realIndex = allApplications.findIndex(a =>
        a.company === app.company &&
        a.role === app.role &&
        a.date === app.date
      );

      const card = document.createElement('div');
      card.className = 'app-card';
      // Build optional tags for salary, jobType, workMode
      const salaryTag = app.salary
        ? `<span class="app-tag tag-salary">💰 ${escapeHtml(app.salary)}</span>` : '';
      const jobTypeTag = app.jobType
        ? `<span class="app-tag tag-jobtype">${escapeHtml(app.jobType)}</span>` : '';
      const workModeTag = app.workMode && app.workMode !== 'On-site'
        ? `<span class="app-tag tag-workmode">${escapeHtml(app.workMode)}</span>` : '';
      const tagsHtml = (salaryTag || jobTypeTag || workModeTag)
        ? `<div class="app-tags">${salaryTag}${jobTypeTag}${workModeTag}</div>` : '';

      card.innerHTML = `
        <div class="app-card-top">
          <div class="app-company">${escapeHtml(app.company)}</div>
          <button class="btn-delete" data-index="${realIndex}">🗑</button>
        </div>
        <div class="app-role" title="${escapeHtml(app.role)}">${escapeHtml(app.role)}</div>
        ${tagsHtml}
        <div class="app-card-bottom">
          <div class="app-meta">
            <span class="app-platform">${escapeHtml(app.platform || 'Unknown')}</span>
            <div class="app-dot"></div>
            <span class="app-date" title="${escapeHtml(formatDateFull(app.date))}">${formatDate(app.date)}</span>
          </div>
          <select class="status-select status-badge status-${app.status.replace(' ', '-')}"
            data-index="${realIndex}">
            <option value="Applied" ${app.status === 'Applied' ? 'selected' : ''}>Applied</option>
            <option value="In Review" ${app.status === 'In Review' ? 'selected' : ''}>In Review</option>
            <option value="Interview" ${app.status === 'Interview' ? 'selected' : ''}>Interview</option>
            <option value="Shortlisted" ${app.status === 'Shortlisted' ? 'selected' : ''}>Shortlisted</option>
            <option value="Rejected" ${app.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </div>
      `;

      card.addEventListener('click', function (e) {
        if (
          e.target.classList.contains('btn-delete') ||
          e.target.classList.contains('status-select')
        ) return;
        if (app.url) chrome.tabs.create({ url: app.url });
      });

      list.appendChild(card);
    });

    // Status change
    document.querySelectorAll('.status-select').forEach(function (select) {
      select.addEventListener('change', function () {
        const idx = parseInt(this.dataset.index);
        allApplications[idx].status = this.value;
        chrome.storage.local.set({ applications: allApplications }, loadApplications);
      });
    });

    // FIX BUG 3: Delete with inline confirm — no window.confirm() which is
    // blocked in MV3 extension popups on some Chrome versions.
    document.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const idx = parseInt(this.dataset.index);
        const card = this.closest('.app-card');
        const company = allApplications[idx].company;

        // If inline confirm already showing on this card, remove it
        const existing = card.querySelector('.delete-confirm-row');
        if (existing) { existing.remove(); return; }

        // Build inline confirm row
        const confirmRow = document.createElement('div');
        confirmRow.className = 'delete-confirm-row';
        confirmRow.style.cssText = `
          display:flex; align-items:center; justify-content:space-between;
          gap:8px; padding:8px 0 0 0; border-top:1px solid #fee2e2;
          margin-top:8px;
        `;
        confirmRow.innerHTML = `
          <span style="font-size:12px;color:#ef4444;font-weight:500;">
            Delete "${company}"?
          </span>
          <div style="display:flex;gap:6px;">
            <button class="confirm-yes" style="
              padding:4px 12px;background:#ef4444;color:white;
              border:none;border-radius:6px;font-size:12px;
              font-weight:600;cursor:pointer;">Yes</button>
            <button class="confirm-no" style="
              padding:4px 12px;background:#f3f4f6;color:#374151;
              border:none;border-radius:6px;font-size:12px;
              font-weight:600;cursor:pointer;">No</button>
          </div>
        `;

        card.appendChild(confirmRow);

        confirmRow.querySelector('.confirm-yes').addEventListener('click', function(e) {
          e.stopPropagation();
          allApplications.splice(idx, 1);
          chrome.storage.local.set({ applications: allApplications }, loadApplications);
        });
        confirmRow.querySelector('.confirm-no').addEventListener('click', function(e) {
          e.stopPropagation();
          confirmRow.remove();
        });
      });
    });
  }

  // ── Search ──
  document.getElementById('searchInput').addEventListener('input', function () {
    currentSearch = this.value;
    renderApplications();
  });

  // ── Filter Tabs ──
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      currentFilter = this.dataset.filter;
      renderApplications();
    });
  });

  // ── Manual Add ──
  document.getElementById('btnAdd').addEventListener('click', function () {
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('addCompany').focus();
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('btnCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('addCompany').value = '';
    document.getElementById('addRole').value = '';
    document.getElementById('addLocation').value = '';
    document.getElementById('addPlatform').value = '';
    document.getElementById('addStatus').value = 'Applied';
  }

  document.getElementById('btnSave').addEventListener('click', function () {
    const company = document.getElementById('addCompany').value.trim();
    const role = document.getElementById('addRole').value.trim();
    const location = document.getElementById('addLocation').value.trim();
    const platform = document.getElementById('addPlatform').value || 'Other';
    const status = document.getElementById('addStatus').value;

    if (!company || !role) {
      alert('Please enter company name and job role.');
      return;
    }

    // FIX BUG 1: duplicate check via IndexedDB
    // (We check allApplications in memory since it's already loaded — fast)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const isDuplicate = allApplications.some(app =>
      app.company.toLowerCase() === company.toLowerCase() &&
      app.role.toLowerCase() === role.toLowerCase() &&
      new Date(app.date).getTime() > cutoff
    );

    if (isDuplicate) {
      alert('⚠️ You already applied here recently!');
      return;
    }

    const newApp = {
      company, role,
      location: location || 'Unknown Location',
      platform, url: '',
      date: new Date().toISOString(),
      status
    };

    allApplications.unshift(newApp);
    chrome.storage.local.set({ applications: allApplications }, function () {
      closeModal();
      loadApplications();
    });
  });

  // ── Export Modal ──
  function openExportModal(type) {
    currentExportType = type;
    document.getElementById('exportModalTitle').textContent =
      type === 'csv' ? '⬇ Export CSV' : '📊 Export Excel';
    document.getElementById('exportModal').style.display = 'flex';
    updatePeriodCount();
  }

  function closeExportModal() {
    document.getElementById('exportModal').style.display = 'none';
    document.querySelector('input[name="exportPeriod"][value="all"]').checked = true;
  }

  function updatePeriodCount() {
    const period = document.querySelector('input[name="exportPeriod"]:checked')?.value || 'all';
    const count = filterByPeriod(period).length;
    document.getElementById('periodCount').textContent =
      `${count} application${count !== 1 ? 's' : ''} will be exported`;
  }

  // Period radio change
  document.querySelectorAll('input[name="exportPeriod"]').forEach(function (radio) {
    radio.addEventListener('change', updatePeriodCount);
  });

  document.getElementById('exportModalClose').addEventListener('click', closeExportModal);
  document.getElementById('exportCancel').addEventListener('click', closeExportModal);
  document.getElementById('exportModal').addEventListener('click', function (e) {
    if (e.target === this) closeExportModal();
  });

  document.getElementById('btnExport').addEventListener('click', function () {
    if (allApplications.length === 0) {
      alert('No applications to export.');
      return;
    }
    openExportModal('csv');
  });

  document.getElementById('btnExcel').addEventListener('click', function () {
    if (allApplications.length === 0) {
      alert('No applications to export.');
      return;
    }
    openExportModal('excel');
  });

  document.getElementById('exportDownload').addEventListener('click', function () {
    const period = document.querySelector('input[name="exportPeriod"]:checked')?.value || 'all';
    const data = filterByPeriod(period);

    if (data.length === 0) {
      alert('No applications found for this period.');
      return;
    }

    if (currentExportType === 'csv') {
      downloadCSV(data);
    } else {
      downloadExcel(data);
    }

    closeExportModal();
  });

  // ── Download CSV ──
  function downloadCSV(data) {
    const headers = ['Company', 'Role', 'Location', 'Platform', 'Salary', 'Job Type', 'Work Mode', 'Status', 'Date Applied', 'URL'];
    const rows = data.map(app => [
      `"${app.company}"`,
      `"${app.role}"`,
      `"${app.location || ''}"`,
      `"${app.platform || ''}"`,
      `"${app.salary || ''}"`,
      `"${app.jobType || ''}"`,
      `"${app.workMode || ''}"`,
      `"${app.status}"`,
      `"${formatDateFull(app.date)}"`,
      `"${app.url || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AppliedIn_${formatDateFile(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Download Excel — FIX BUG 4: lazy load xlsx only when needed ──
  function downloadExcel(data) {
    const btn = document.getElementById('exportDownload');
    const originalText = btn.textContent;
    btn.textContent = 'Loading...';
    btn.disabled = true;

    function doExport() {
      const rows = [
        ['Company', 'Role', 'Location', 'Platform', 'Salary', 'Job Type', 'Work Mode', 'Status', 'Date Applied', 'Job URL']
      ];
      data.forEach(app => {
        rows.push([
          app.company || '',
          app.role || '',
          app.location || '',
          app.platform || '',
          app.salary || '',
          app.jobType || '',
          app.workMode || '',
          app.status || '',
          formatDateFull(app.date),
          app.url || ''
        ]);
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 15 },
        { wch: 18 }, { wch: 14 }, { wch: 12 },
        { wch: 15 }, { wch: 22 }, { wch: 40 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Applications');
      XLSX.writeFile(wb, `AppliedIn_${formatDateFile(new Date())}.xlsx`);
      btn.textContent = originalText;
      btn.disabled = false;
    }

    // If already loaded, use it directly
    if (typeof XLSX !== 'undefined') {
      doExport();
      return;
    }

    // Otherwise inject script dynamically — loads only once, on first Excel export
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('../xlsx.full.min.js');
    script.onload = function() { doExport(); };
    script.onerror = function() {
      btn.textContent = originalText;
      btn.disabled = false;
      alert('Failed to load Excel library. Try again.');
    };
    document.head.appendChild(script);
  }

  // ── Helpers ──
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (diff === 0) return `Today, ${time}`;
    if (diff === 1) return `Yesterday, ${time}`;
    if (diff < 7) return `${diff} days ago, ${time}`;
    if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function formatDateFull(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-IN');
  }

  function formatDateFile(date) {
    return date.toISOString().split('T')[0];
  }

  // ── Initial Load ──
  // loadApplications() already called above
});