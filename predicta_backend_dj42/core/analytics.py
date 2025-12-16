# core/analytics.py
from datetime import datetime, timedelta
from .mongo_client import get_mongo_db


def log_recruiter_login(user, ip=None, user_agent=None):
    print("⚡ Logging recruiter login to MongoDB...")
    db = get_mongo_db()
    db.recruiter_logins.insert_one({
        "user_id": user.id,
        "email": user.email,
        "name": user.first_name or "",
        "ip": ip,
        "user_agent": user_agent,
        "logged_in_at": datetime.utcnow(),
    })


def log_job_created(user, job):
    db = get_mongo_db()
    db.recruiter_jobs.insert_one({
        "user_id": user.id,
        "job_id": job.id,
        "title": job.title,
        "created_at": datetime.utcnow(),
    })

def log_ranking_run(user, job, results_count):
    db = get_mongo_db()
    db.matching_runs.insert_one({
        "user_id": user.id,
        "job_id": job.id,
        "results_count": results_count,
        "run_at": datetime.utcnow(),
    })

def save_job_description(job):
    """
    Store the job description text in MongoDB.
    Satisfies FR7.1 for job descriptions.
    """
    db = get_mongo_db()
    doc = {
        "job_id": job.id,
        "owner_id": getattr(job, "owner_id", None),
        "title": getattr(job, "title", ""),
        "jd_text": getattr(job, "jd_text", ""),
        "remove_stopwords": getattr(job, "remove_stopwords", None),
        "anonymize_pii": getattr(job, "anonymize_pii", None),
        "created_at_django": getattr(job, "created_at", None),
        "stored_at": datetime.utcnow(),
    }
    db.job_descriptions.insert_one(doc)


def save_parsed_resume(candidate):
    """
    Store parsed resume text in MongoDB.
    Satisfies FR7.1 for parsed resumes.
    """
    db = get_mongo_db()
    doc = {
        "candidate_id": candidate.id,
        "job_id": getattr(candidate, "job_id", None),
        "name": getattr(candidate, "name", ""),
        "email": getattr(candidate, "email", ""),
        "resume_text": getattr(candidate, "resume_text", ""),
        "uploaded_file": (
            candidate.uploaded_file.url
            if getattr(candidate, "uploaded_file", None)
            else None
        ),
        "created_at_django": getattr(candidate, "created_at", None),
        "stored_at": datetime.utcnow(),
    }
    db.parsed_resumes.insert_one(doc)


def log_resume_uploaded(user, job, candidate, source="file_upload", parsed_ok=True):
    """
    Log each candidate resume the recruiter uploads or creates.
    """
    db = get_mongo_db()
    db.resume_uploads.insert_one({
        "user_id": user.id,
        "job_id": job.id,
        "job_title": job.title,
        "candidate_id": candidate.id,
        "candidate_name": candidate.name,
        "candidate_email": candidate.email,
        "source": source,  # "file_upload" or "json"
        "parsed_ok": parsed_ok,
        "uploaded_at": datetime.utcnow(),
    })
def log_ranking_results(user, job, rows, top_n=10):
    """
    Store analytics-friendly snapshot of a ranking run:
    top N candidates with scores and basic info.
    """
    db = get_mongo_db()

    # Take only the top N entries for analytics
    top_rows = []
    for r in rows[:top_n]:
        top_rows.append({
            "candidate_id": r.get("id"),
            "name": r.get("name"),
            "email": r.get("email"),
            "score": r.get("score"),
            "token_count": r.get("tokenCount"),
            "overlap_skills": r.get("skillOverlap", []),
        })

    db.ranking_results.insert_one({
        "user_id": user.id,
        "job_id": job.id,
        "job_title": job.title,
        "total_results": len(rows),
        "top_n": top_n,
        "top_results": top_rows,
        "created_at": datetime.utcnow(),
    })

def log_export_csv(user, job, results_count):
    """
    Log each time a recruiter exports ranked candidates to CSV.
    """
    db = get_mongo_db()
    db.exports.insert_one({
        "user_id": user.id,
        "job_id": job.id,
        "job_title": job.title,
        "results_count": results_count,
        "exported_at": datetime.utcnow(),
    })

def get_recruiter_summary(user_email=None):
    """
    Aggregate usage analytics.

    If user_email is provided → filter by that email.
    If not → return global totals.
    """
    db = get_mongo_db()
    filter_base = {}
    if user_email:
        filter_base["user_email"] = user_email

    # --- Totals ---
    total_logins = db.recruiter_logins.count_documents(
        {"user_email": user_email} if user_email else {}
    )
    total_jobs = db.recruiter_jobs.count_documents(filter_base)
    total_runs = db.matching_runs.count_documents(filter_base)
    total_exports = db.exports.count_documents(filter_base)

    # --- Time-series for last 30 days ---
    now = datetime.utcnow()
    since = now - timedelta(days=30)

    # helper to merge base filter with date
    def with_date(field):
        f = dict(filter_base)
        f[field] = {"$gte": since}
        return f

    jobs_pipeline = [
        {"$match": with_date("created_at")},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    runs_pipeline = [
        {"$match": with_date("run_at")},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$run_at"}
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    jobs_by_day_raw = list(db.recruiter_jobs.aggregate(jobs_pipeline))
    runs_by_day_raw = list(db.matching_runs.aggregate(runs_pipeline))

    jobs_by_day = [{"date": d["_id"], "count": d["count"]} for d in jobs_by_day_raw]
    runs_by_day = [{"date": d["_id"], "count": d["count"]} for d in runs_by_day_raw]

    return {
        "totals": {
            "logins": total_logins,
            "jobs": total_jobs,
            "matching_runs": total_runs,
            "exports": total_exports,
        },
        "jobs_by_day": jobs_by_day,
        "runs_by_day": runs_by_day,
    }

from datetime import datetime
from .mongo_client import get_mongo_db

# ... existing log_* functions + get_recruiter_summary stay as they are ...


def log_analytics_event(event_type, user_email=None):
    """
    Lightweight logger used by the frontend.
    We tag each event with 'user_email' so analytics can be per login.
    """
    db = get_mongo_db()
    now = datetime.utcnow()

    base = {
        "user_email": user_email or None,
    }

    if event_type == "job":
        db.recruiter_jobs.insert_one({
            **base,
            "job_id": None,
            "title": "(frontend only)",
            "created_at": now,
        })

    elif event_type == "ranking":
        db.matching_runs.insert_one({
            **base,
            "job_id": None,
            "results_count": 0,
            "run_at": now,
        })

    elif event_type == "export":
        db.exports.insert_one({
            **base,
            "job_id": None,
            "job_title": "(frontend only)",
            "results_count": 0,
            "exported_at": now,
        })

    elif event_type == "login":
        db.recruiter_logins.insert_one({
            **base,
            "email": user_email or "",
            "ip": None,
            "user_agent": None,
            "logged_in_at": now,
        })
    else:
        return
