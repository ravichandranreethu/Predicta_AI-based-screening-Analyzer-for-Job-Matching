from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    JobViewSet,
    CandidateViewSet,
    signup,
    LoginView,
    me,
    forgot,
    reset,
    predict_rank,
    retrain_model,
    linkedin_job_search,      
    recruiter_analytics,
    analytics_log_event, 
)

router = DefaultRouter()
router.register(r"jobs", JobViewSet, basename="job")
router.register(r"candidates", CandidateViewSet, basename="candidate")

urlpatterns = [
    path("", include(router.urls)),

    # Auth
    path("auth/signup", signup),
    path("auth/login", LoginView.as_view()),
    path("auth/token/refresh", TokenRefreshView.as_view()),
    path("me", me),
    path("auth/forgot", forgot),
    path("auth/reset", reset),

    # ML
    path("ml/predict/", predict_rank),
    path("ml/retrain/", retrain_model),

    # 🔹 Correct LinkedIn Search Endpoint
    path("external/linkedin-search/", linkedin_job_search),

    path("analytics/overview/", recruiter_analytics),
    path("analytics/log-event/", analytics_log_event),
]
