from django.contrib import admin
from .models import Job, Candidate, Ranking

@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "owner", "created_at")

@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display = ("id", "job", "name", "email", "created_at")

@admin.register(Ranking)
class RankingAdmin(admin.ModelAdmin):
    list_display = ("job", "created_at")
