# Predicta Backend (Django REST)

Endpoints for Jobs, Candidates (file upload + text extraction), TF‑IDF ranking, CSV export,
and auth (signup/login/forgot/reset/me). Designed to connect with your existing static frontend.

## 1) Setup (first time)

```bash
cd predicta_backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create .env from template
cp .env.example .env

# Initialize DB
python manage.py migrate
python manage.py createsuperuser  # optional
python manage.py runserver
```

Visit http://127.0.0.1:8000/ to see the "API root" and http://127.0.0.1:8000/api/schema/swagger/ for docs.

## 2) Switching to Postgres (optional)

- Install PostgreSQL
- In `predicta_backend/settings.py`, comment out the SQLite config and uncomment the Postgres config block.
- Update `.env` values for DB_* to match your database.
- Run `python manage.py migrate` again.

## 3) Frontend Integration (quick)

- Serve your existing static pages from a file server (e.g., VSCode Live Server on :5500).
- Replace localStorage auth calls with `fetch('/api/auth/...')` (see `README_FRONTEND_SNIPPETS.md`).
- For file uploads, `POST /api/jobs/{id}/candidates` with `multipart/form-data` (field name `file`).

## 4) Deployment (brief)

- Set `DEBUG=False` in `.env`
- Add HTTPS + a real email backend
- Use Gunicorn + Nginx
- Store `MEDIA_ROOT` on persistent storage (e.g., S3 via django-storages)
