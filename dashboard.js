// Dashboard logic: uses existing auth-state-ready event and cloud-service
document.addEventListener('DOMContentLoaded', () => {
  const welcome = document.getElementById('dashboard-welcome');
  const statMy = document.getElementById('stat-my-resources');
  const statApproved = document.getElementById('stat-approved');
  const statPending = document.getElementById('stat-pending');
  const statDownloads = document.getElementById('stat-downloads');
  const recentList = document.getElementById('recent-list');
  const emptyState = document.getElementById('empty-state');
  const errorBox = document.getElementById('dashboard-error');

  function setLoading() {
    recentList.innerHTML = '<div class="loading">Loading your uploads…</div>';
    errorBox.style.display = 'none';
    emptyState.style.display = 'none';
  }

  function showError(message, err) {
    console.error('Dashboard error:', err);
    errorBox.textContent = message;
    errorBox.style.display = 'block';
    recentList.innerHTML = '';
  }

  async function loadForUser(user) {
    if (!user) return; // auth-ui will handle redirect for unauthenticated pages
    welcome.textContent = `Welcome back, ${user.displayName || user.email || 'Student'}`;
    setLoading();
    try {
      const cloud = await import('./cloud-service.js');
      const resources = await cloud.fetchResources({ isAdmin: document.documentElement.dataset.isAdmin === 'true', userId: user.uid });
      // Filter to only those submitted by this user
      const mine = (resources || []).filter(r => String(r.submittedByUid || '') === String(user.uid));

      const total = mine.length;
      const approved = mine.filter(r => (r.status || 'approved') === 'approved').length;
      const pending = mine.filter(r => (r.status || '') === 'pending').length;
      const downloads = mine.reduce((s, r) => s + Number(r.downloadCount || 0), 0);

      statMy.textContent = total;
      statApproved.textContent = approved;
      statPending.textContent = pending;
      statDownloads.textContent = downloads;

      if (!mine.length) {
        recentList.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }

      const recent = mine.slice().sort((a,b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)).slice(0,5);
      recentList.innerHTML = recent.map(r => {
        const status = (r.status || 'approved');
        return `
          <article class="resource-card small">
            <div class="resource-top">
              <div class="file-icon">${String((r.fileName||'').split('.').pop()||'FILE').slice(0,4).toUpperCase()}</div>
              <div>
                <h3>${escapeHtml(r.title)}</h3>
                <p class="muted">${escapeHtml(r.course || '')}${r.level ? ` · ${escapeHtml(r.level)}` : ''}</p>
              </div>
            </div>
            <div class="resource-tags">
              <span class="tag">${escapeHtml(r.type || '')}</span>
              <span class="tag">${escapeHtml(r.year || '')}</span>
              <span class="tag">${escapeHtml(formatBytes(r.fileSize))}</span>
            </div>
            <div class="resource-meta">
              <span class="approval-status ${status}">${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span>
              <span class="muted">${escapeHtml(formatDownloadCount(r.downloadCount))}</span>
            </div>
          </article>`;
      }).join('');
    } catch (err) {
      showError('Could not load your uploads. Try again later.', err);
    }
  }

  // Utilities borrowed from main.js environment
  function escapeHtml(value = '') {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[char]));
  }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
    const units = ['B','KB','MB','GB'];
    const index = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length - 1);
    return `${(bytes/(1024**index)).toFixed(index===0?0:1)} ${units[index]}`;
  }
  function formatDownloadCount(value) {
    const count = Number(value ?? 0);
    return `📥 ${count} Download${count === 1 ? '' : 's'}`;
  }

  // Listen for auth ready event emitted by auth-ui.js
  document.addEventListener('auth-state-ready', (e) => {
    const user = e.detail?.user || null;
    if (!user) return; // auth-ui handles redirect
    loadForUser(user);
  });
});
