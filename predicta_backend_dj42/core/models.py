from django.db import models
from django.contrib.auth.models import User

class Job(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=200, blank=True)
    jd_text = models.TextField()
    remove_stopwords = models.BooleanField(default=True)
    anonymize_pii = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title or f"Job #{self.id}"

class Candidate(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='candidates')
    name = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    resume_text = models.TextField()
    uploaded_file = models.FileField(upload_to="resumes/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name or f"Candidate #{self.id}"

class Ranking(models.Model):
    job = models.OneToOneField(Job, on_delete=models.CASCADE, related_name='ranking')
    results_json = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
