import { watchAuth, logoutAccount, isAdmin, configured } from './auth.js';

function updateUI(user) {
  document.documentElement.dataset.authReady = 'true';
  const admin = isAdmin(user);
  document.documentElement.dataset.isAdmin = String(admin);
  document.documentElement.dataset.isAuthenticated = String(Boolean(user));
  document.documentElement.dataset.currentUserId = user?.uid || '';
  document.documentElement.dataset.currentUserEmail = user?.email || '';
  document.querySelectorAll('[data-admin-only]').forEach(el => el.hidden = !admin);
  document.querySelectorAll('[data-guest-only]').forEach(el => el.hidden = Boolean(user));
  document.querySelectorAll('[data-user-only]').forEach(el => el.hidden = !user);
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user?.displayName || user?.email || 'Account');

  document.querySelectorAll('[data-logout]').forEach(btn => {
    btn.onclick = async () => { await logoutAccount(); location.href = 'login.html'; };
  });

  if (document.body.dataset.requireAuth === 'true') {
    if (!configured) {
      const box = document.querySelector('[data-auth-status]');
      if (box) { box.hidden = false; box.textContent = 'Connect Firebase in firebase-config.js before using account protection.'; }
      document.querySelector('main')?.classList.add('auth-blocked');
      return;
    }
    if (!user) {
      location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
      return;
    }
  }

  if (document.body.dataset.requireAdmin === 'true') {
    if (!configured) {
      const box = document.querySelector('[data-auth-status]');
      if (box) { box.hidden = false; box.textContent = 'Connect Firebase in firebase-config.js before using account protection.'; }
      document.querySelector('main')?.classList.add('auth-blocked');
      return;
    }
    if (!user) location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
    else if (!admin) location.replace('resources.html?denied=1');
  }
}
let currentUser = null;
watchAuth((user) => {
  currentUser = user;
  updateUI(user);
  document.dispatchEvent(new CustomEvent('auth-state-ready', { detail: { user } }));
});
document.addEventListener('resources-rendered', () => updateUI(currentUser));
