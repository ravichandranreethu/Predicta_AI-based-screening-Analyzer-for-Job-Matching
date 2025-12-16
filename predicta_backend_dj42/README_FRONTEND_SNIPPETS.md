# Frontend wiring snippets

## Store & use JWT
```js
const token = localStorage.getItem('jwt');
const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
```

## Signup
```js
const r = await fetch('/api/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, email, password })
});
const data = await r.json();
localStorage.setItem('jwt', data.access);
localStorage.setItem('me', JSON.stringify({ name: data.name, email }));
location.href = 'index.html';
```

## Login
```js
const r = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
if (!r.ok) { alert('Login failed'); return; }
const data = await r.json();
localStorage.setItem('jwt', data.access);
localStorage.setItem('me', JSON.stringify({ name: data.name, email }));
location.href = 'index.html';
```

## Get profile
```js
const r = await fetch('/api/me', { headers: authHeaders });
const me = await r.json(); // {name, email}
```

## Create Job
```js
const r = await fetch('/api/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders },
  body: JSON.stringify({ title, jd_text, remove_stopwords: true, anonymize_pii: true })
});
const job = await r.json();
```

## Add Candidate via file upload
```js
const fd = new FormData();
fd.append('job', job.id);
fd.append('file', fileInput.files[0]); // <input type="file" ...>
fd.append('name', candidateName || '');
fd.append('email', candidateEmail || '');

const r = await fetch(`/api/jobs/${job.id}/candidates`, {
  method: 'POST',
  headers: { ...authHeaders },
  body: fd
});
const cand = await r.json();
```

## Add Candidate via pasted text
```js
const r = await fetch(`/api/jobs/${job.id}/candidates`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders },
  body: JSON.stringify({ name, email, resume_text })
});
```

## Rank candidates
```js
const r = await fetch(`/api/jobs/${job.id}/rank`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders }
});
const results = await r.json(); // array [{name, email, score, skillOverlap,...}]
```

## Export CSV
```js
window.location.href = `/api/jobs/${job.id}/export.csv?auth=${encodeURIComponent(token)}`;
// or pipe through a small proxy endpoint that attaches Authorization header
```
