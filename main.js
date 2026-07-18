const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navLinks.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      navLinks.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', (event) => {
    if (!navLinks.contains(event.target) && !menuToggle.contains(event.target)) {
      navLinks.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
}


document.querySelectorAll('[data-year]').forEach((node) => {
  node.textContent = new Date().getFullYear();
});

let cloudServicePromise = null;
function getCloudService() {
  if (!cloudServicePromise) cloudServicePromise = import('./cloud-service.js');
  return cloudServicePromise;
}

async function addResource(resource, callbacks = {}) {
  const cloud = await getCloudService();
  return cloud.createResource(resource, callbacks);
}

async function getResources() {
  const cloud = await getCloudService();
  return cloud.fetchResources({
    isAdmin: document.documentElement.dataset.isAdmin === 'true',
    userId: document.documentElement.dataset.currentUserId || ''
  });
}

async function deleteResource(id) {
  const cloud = await getCloudService();
  return cloud.removeResourceRecord(id);
}

async function updateResource(resource) {
  const cloud = await getCloudService();
  return cloud.saveResource(resource);
}

async function createFileUrl(resource) {
  if (resource.storagePath) {
    const cloud = await getCloudService();
    return cloud.getSignedResourceUrl(resource.storagePath);
  }
  if (resource.file instanceof Blob) return URL.createObjectURL(resource.file);
  throw new Error('This document does not have an available file.');
}

async function getResourceBlob(resource) {
  if (resource.file instanceof Blob) return resource.file;
  const url = await createFileUrl(resource);
  const response = await fetch(url);
  if (!response.ok) throw new Error('The document could not be loaded for preview.');
  return response.blob();
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const heroSearchForm = document.querySelector('[data-hero-search-form]');
heroSearchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = heroSearchForm.querySelector('input').value.trim();
  window.location.href = `resources.html${query ? `?q=${encodeURIComponent(query)}` : ''}`;
});

const uploadForm = document.querySelector('[data-upload-form]');
uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (document.documentElement.dataset.isAuthenticated !== 'true') {
    alert('Please log in before submitting a resource.');
    location.href = 'login.html?next=upload.html';
    return;
  }
  const message = document.querySelector('[data-form-message]');
  const submitButton = uploadForm.querySelector('button[type="submit"]');
  const file = document.querySelector('#file')?.files?.[0];

  if (!file) {
    message.hidden = false;
    message.textContent = 'Choose a document before submitting.';
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    message.hidden = false;
    message.textContent = 'The file is too large. Please use a document smaller than 25 MB.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Uploading...';
  try {
    await addResource({
      title: document.querySelector('#title').value.trim(),
      course: document.querySelector('#course').value,
      courseSlug: slugify(document.querySelector('#course').value),
      type: document.querySelector('#type').value,
      typeSlug: slugify(document.querySelector('#type').value),
      level: document.querySelector('#level').value.trim(),
      year: document.querySelector('#year').value.trim(),
      description: document.querySelector('#description').value.trim(),
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      file,
      status: document.documentElement.dataset.isAdmin === 'true' ? 'approved' : 'pending',
      submittedByUid: document.documentElement.dataset.currentUserId || '',
      submittedByEmail: document.documentElement.dataset.currentUserEmail || '',
      createdAt: Date.now()
    }, {
      onProgress(percent) {
        submitButton.textContent = `Uploading file… ${percent}%`;
      },
      onStage(stage) {
        if (stage === 'uploading') submitButton.textContent = 'Connecting to cloud storage…';
        if (stage === 'saving') submitButton.textContent = 'Saving resource details…';
      }
    });
    uploadForm.reset();
    message.hidden = false;
    message.textContent = document.documentElement.dataset.isAdmin === 'true'
      ? 'Resource approved and added to the library.'
      : 'Resource submitted successfully. It is pending administrator approval.';
    message.classList.add('success-notice');
  } catch (error) {
    console.error(error);
    message.hidden = false;
    message.textContent = error.message || 'The resource could not be uploaded. Check your internet connection and cloud settings.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit Resource';
  }
});

const libraryGrid = document.querySelector('[data-library-grid]');
const resourceSearch = document.querySelector('[data-resource-search]');
const courseFilter = document.querySelector('[data-course-filter]');
const typeFilter = document.querySelector('[data-type-filter]');
const emptyState = document.querySelector('[data-empty-state]');
let loadedResources = [];

const resourceParams = new URLSearchParams(location.search);
if (resourceSearch && resourceParams.get('q')) resourceSearch.value = resourceParams.get('q');
if (courseFilter && resourceParams.get('course')) courseFilter.value = resourceParams.get('course');
if (typeFilter && resourceParams.get('type')) typeFilter.value = resourceParams.get('type');


function normalizedStatus(resource) {
  return resource.status || 'approved';
}

function canCurrentUserSee(resource) {
  const status = normalizedStatus(resource);
  if (document.documentElement.dataset.isAdmin === 'true') return true;
  if (status === 'approved') return true;
  return Boolean(document.documentElement.dataset.currentUserId) &&
    resource.submittedByUid === document.documentElement.dataset.currentUserId;
}

function ensurePreviewModal() {
  let modal = document.querySelector('[data-preview-modal]');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'preview-modal';
  modal.dataset.previewModal = '';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div class="preview-header">
        <div><span class="eyebrow">Document preview</span><h2 id="preview-title" data-preview-title></h2></div>
        <button class="preview-close" type="button" data-preview-close aria-label="Close preview">×</button>
      </div>
      <div class="preview-body" data-preview-body></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => {
    const frame = modal.querySelector('iframe');
    if (frame?.dataset.objectUrl) URL.revokeObjectURL(frame.dataset.objectUrl);
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    modal.querySelector('[data-preview-body]').innerHTML = '';
  };
  modal.querySelector('[data-preview-close]').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
  return modal;
}

async function previewResource(resource) {
  const modal = ensurePreviewModal();
  const body = modal.querySelector('[data-preview-body]');
  modal.querySelector('[data-preview-title]').textContent = resource.title;
  body.innerHTML = '<p class="preview-loading">Preparing preview…</p>';
  modal.hidden = false;
  document.body.classList.add('modal-open');

  const extension = (resource.fileName.split('.').pop() || '').toLowerCase();
  const mime = resource.fileType || '';
  try {
    if (mime === 'application/pdf' || extension === 'pdf') {
      const url = await createFileUrl(resource);
      body.innerHTML = `<iframe class="preview-frame" title="${escapeHtml(resource.title)}"></iframe>`;
      const frame = body.querySelector('iframe');
      frame.src = `${url}#toolbar=1&navpanes=0`;
      frame.dataset.objectUrl = url;
      return;
    }
    if (mime.startsWith('image/') || ['png','jpg','jpeg','gif','webp','svg'].includes(extension)) {
      const url = await createFileUrl(resource);
      body.innerHTML = `<img class="preview-image" alt="${escapeHtml(resource.title)}">`;
      const image = body.querySelector('img');
      image.src = url;
      image.onload = () => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); };
      return;
    }
    if (mime.startsWith('text/') || ['txt','csv','md'].includes(extension)) {
      const blob = await getResourceBlob(resource);
      body.innerHTML = `<pre class="preview-text">${escapeHtml(await blob.text())}</pre>`;
      return;
    }
    if (extension === 'docx') {
      if (!window.mammoth) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const blob = await getResourceBlob(resource);
      const result = await window.mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      body.innerHTML = `<article class="docx-preview">${result.value}</article>`;
      return;
    }
    body.innerHTML = `
      <div class="preview-unavailable">
        <h3>Browser preview is not available for this file type</h3>
        <p>${escapeHtml(resource.fileName)} is a ${escapeHtml(extension.toUpperCase() || 'document')} file. It will no longer download automatically when Preview is clicked.</p>
        <p>Use the Download button when you are ready to open it in the appropriate application.</p>
      </div>`;
  } catch (error) {
    console.error(error);
    body.innerHTML = '<div class="preview-unavailable"><h3>Preview could not be prepared</h3><p>Please use the Download button to open this document.</p></div>';
  }
}

function renderResources() {
  if (!libraryGrid) return;
  const term = (resourceSearch?.value || '').trim().toLowerCase();
  const course = courseFilter?.value || 'all';
  const type = typeFilter?.value || 'all';
  const filtered = loadedResources.filter((resource) => {
    if (!canCurrentUserSee(resource)) return false;
    const searchable = `${resource.title} ${resource.course} ${resource.type} ${resource.level} ${resource.year} ${resource.description}`.toLowerCase();
    return (!term || searchable.includes(term)) &&
      (course === 'all' || resource.courseSlug === course) &&
      (type === 'all' || resource.typeSlug === type);
  });

  libraryGrid.innerHTML = filtered.map((resource) => `
    <article class="resource-card" data-resource-id="${resource.id}">
      <div class="resource-top">
        <div class="file-icon">${escapeHtml((resource.fileName.split('.').pop() || 'FILE').slice(0, 4).toUpperCase())}</div>
        <div>
          <h3>${escapeHtml(resource.title)}</h3>
          <p class="muted">${escapeHtml(resource.course)}${resource.level ? ` · ${escapeHtml(resource.level)}` : ''}</p>
        </div>
      </div>
      ${resource.description ? `<p class="resource-description">${escapeHtml(resource.description)}</p>` : ''}
      <div class="resource-tags">
        <span class="tag">${escapeHtml(resource.type)}</span>
        ${resource.year ? `<span class="tag">${escapeHtml(resource.year)}</span>` : ''}
        <span class="tag">${formatBytes(resource.fileSize)}</span>
      </div>
      ${normalizedStatus(resource) === 'pending' ? `<div class="approval-status pending">Pending approval${resource.submittedByEmail ? ` · ${escapeHtml(resource.submittedByEmail)}` : ''}</div>` : ''}
      <div class="resource-actions">
        <button class="btn btn-outline" type="button" data-preview-id="${resource.id}">Preview</button>
        ${normalizedStatus(resource) === 'approved' ? `<button class="btn btn-primary" type="button" data-download-id="${resource.id}">Download</button>` : ''}
        ${normalizedStatus(resource) === 'pending' ? `<button class="btn btn-success" type="button" data-admin-only hidden data-approve-id="${resource.id}">Approve</button>` : ''}
        <button class="btn btn-danger" type="button" data-admin-only hidden data-delete-id="${resource.id}" aria-label="Delete ${escapeHtml(resource.title)}">Delete</button>
      </div>
    </article>`).join('');

  document.dispatchEvent(new CustomEvent('resources-rendered'));

  if (emptyState) {
    emptyState.style.display = filtered.length ? 'none' : 'block';
    emptyState.textContent = loadedResources.length
      ? 'No resources match your search. Try another keyword or filter.'
      : 'No approved resources are available yet. Logged-in students can use Upload to submit a document for review.';
  }
}

async function loadLibrary() {
  if (!libraryGrid) return;
  try {
    loadedResources = await getResources();
    renderResources();
  } catch (error) {
    console.error(error);
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.textContent = 'The cloud library could not be opened. Check your internet connection and Firestore rules.';
    }
  }
}

[resourceSearch, courseFilter, typeFilter].forEach((control) => {
  control?.addEventListener('input', renderResources);
  control?.addEventListener('change', renderResources);
});

libraryGrid?.addEventListener('click', async (event) => {
  const previewButton = event.target.closest('[data-preview-id]');
  const downloadButton = event.target.closest('[data-download-id]');
  const approveButton = event.target.closest('[data-approve-id]');
  const deleteButton = event.target.closest('[data-delete-id]');
  const id = previewButton?.dataset.previewId || downloadButton?.dataset.downloadId || approveButton?.dataset.approveId || deleteButton?.dataset.deleteId;
  const resource = loadedResources.find((item) => String(item.id) === String(id));
  if (!resource) return;

  if (previewButton) {
    await previewResource(resource);
  }
  if (downloadButton) {
    const url = await createFileUrl(resource);
    const link = document.createElement('a');
    if (url.startsWith('http')) {
      const downloadUrl = new URL(url);
      downloadUrl.searchParams.set('download', resource.fileName);
      link.href = downloadUrl.toString();
    } else {
      link.href = url;
    }
    link.download = resource.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (approveButton) {
    if (document.documentElement.dataset.isAdmin !== 'true') {
      alert('Only the administrator can approve resources.');
      return;
    }
    resource.status = 'approved';
    resource.approvedAt = Date.now();
    await updateResource(resource);
    renderResources();
    return;
  }
  if (deleteButton) {
    if (document.documentElement.dataset.isAdmin !== 'true') {
      alert('Only the administrator can delete resources.');
      return;
    }
    if (confirm(`Delete “${resource.title}” from the library? (The cloud file will remain in storage for manual cleanup.)`)) {
      await deleteResource(id);
      loadedResources = loadedResources.filter((item) => item.id !== id);
      renderResources();
    }
  }
});

const recentGrid = document.querySelector('[data-recent-resources]');
async function renderRecentResources() {
  if (!recentGrid) return;
  const resources = (await getResources()).filter((resource) => normalizedStatus(resource) === 'approved').slice(0, 4);
  if (!resources.length) {
    recentGrid.innerHTML = '<div class="empty-state home-empty">No documents have been added yet. Add the first resource to start building the library.</div>';
    return;
  }
  recentGrid.innerHTML = resources.map((resource) => `
    <article class="resource-card">
      <div class="resource-top"><div class="file-icon">${escapeHtml((resource.fileName.split('.').pop() || 'FILE').slice(0, 4).toUpperCase())}</div>
      <div><h3>${escapeHtml(resource.title)}</h3><p class="muted">${escapeHtml(resource.course)}${resource.level ? ` · ${escapeHtml(resource.level)}` : ''}</p></div></div>
      <div class="resource-tags"><span class="tag">${escapeHtml(resource.type)}</span><span class="tag">${formatBytes(resource.fileSize)}</span></div>
      <div class="resource-actions"><a class="btn btn-primary" href="resources.html">Open Library</a></div>
    </article>`).join('');
}

document.addEventListener('auth-state-ready', () => {
  if (libraryGrid) loadLibrary();
});

loadLibrary();
renderRecentResources().catch(console.error);
