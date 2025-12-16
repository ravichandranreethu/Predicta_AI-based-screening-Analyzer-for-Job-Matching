# core/mongo_storage.py
from datetime import datetime
from .mongo_client import get_mongo_db


def save_job_description(job):
    """
    Store the full job description in MongoDB (FR7.1).
    One document per job_id.
    """
    db = get_mongo_db()
    db.job_descriptions.update_one(
        {"job_id": job.id},  # match by job_id
        {
            "$set": {
                "job_id": job.id,
                "title": job.title,
                "jd_text": job.jd_text,
                "remove_stopwords": job.remove_stopwords,
                "anonymize_pii": job.anonymize_pii,
                "owner_id": job.owner_id,
                "stored_at": datetime.utcnow(),
            }
        },
        upsert=True,
    )


def save_parsed_resume(candidate):
    """
    Store the parsed resume text in MongoDB (FR7.1).
    One document per candidate_id.
    """
    db = get_mongo_db()
    db.parsed_resumes.update_one(
        {"candidate_id": candidate.id},
        {
            "$set": {
                "candidate_id": candidate.id,
                "job_id": candidate.job_id,
                "name": candidate.name,
                "email": candidate.email,
                "resume_text": candidate.resume_text,
                "uploaded_file": (
                    candidate.uploaded_file.url if candidate.uploaded_file else None
                ),
                "stored_at": datetime.utcnow(),
            }
        },
        upsert=True,
    )
