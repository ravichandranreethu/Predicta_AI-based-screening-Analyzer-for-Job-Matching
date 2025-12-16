from django.contrib.auth.models import User
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.conf import settings

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from .mongo_storage import save_job_description, save_parsed_resume
from .linkedin_client import linkedin_client
from .analytics import get_recruiter_summary

from .models import Job, Candidate, Ranking
from .serializers import (
    JobSerializer, CandidateSerializer, RankingSerializer,
    SignupSerializer, UserSerializer
)
from .permissions import IsOwner
from .scoring import rank as rank_fn
from .utils import read_text_from_upload
from .analytics import (
    log_recruiter_login,
    log_job_created,
    log_ranking_run,
    log_resume_uploaded,
    log_ranking_results,
    log_export_csv,
    log_analytics_event,
)

from rest_framework.decorators import (
    api_view,
    permission_classes,
    authentication_classes,   # <-- add this
)



# ---------- Auth ----------

@api_view(["POST"])
@permission_classes([AllowAny])
def signup(request):
    ser = SignupSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    user = ser.save()
    refresh = RefreshToken.for_user(user)
    ip = request.META.get("REMOTE_ADDR")
    ua = request.META.get("HTTP_USER_AGENT")
    log_recruiter_login(user, ip, ua)
    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "name": user.first_name or "",
        "email": user.email
    }, status=201)

class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        # Get the actual user object
        try:
            username = request.data.get("username")
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return response

        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT")

        log_recruiter_login(user, ip, ua)

        return response


@api_view(["GET"])
def me(request):
    u = request.user
    return Response({"name": u.first_name or "", "email": u.email})

@api_view(["POST"])
@permission_classes([AllowAny])
def forgot(request):
    email = (request.data.get("email") or "").lower()
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # Don't leak existence
        return Response({"ok": True})
    token = PasswordResetTokenGenerator().make_token(user)
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    reset_url = f"http://127.0.0.1:5500/reset.html?uid={uidb64}&token={token}"
    send_mail(
        subject="Your Predicta password reset link",
        message=f"Reset your password: {reset_url}",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
    )
    return Response({"ok": True})

@api_view(["POST"])
@permission_classes([AllowAny])
def reset(request):
    uid = request.data.get("uid")
    token = request.data.get("token")
    new_password = request.data.get("new_password")
    try:
        uid_int = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=uid_int)
    except Exception:
        return Response({"error": "Invalid uid"}, status=400)
    if not PasswordResetTokenGenerator().check_token(user, token):
        return Response({"error": "Invalid or expired token"}, status=400)
    user.set_password(new_password)
    user.save()
    return Response({"ok": True})


# ------------------------------------------------------
# FR7.3 — LinkedIn job search integration (Option B)
# ------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
@authentication_classes([])   
def linkedin_job_search(request):
    """
    Search jobs from LinkedIn / external job API.

    Query params:
      - q: keyword (required)
      - location: optional
      - limit: optional (default 10)

    Returns a list of simplified jobs from linkedin_client.
    """
    query = request.query_params.get("q") or ""
    if not query.strip():
        return Response({"error": "Missing 'q' query parameter"}, status=400)

    location = request.query_params.get("location", "")
    try:
        limit = int(request.query_params.get("limit", 10))
    except ValueError:
        limit = 10

    jobs = linkedin_client.search_jobs(query=query, location=location, limit=limit)

    return Response(
        {
            "query": query,
            "location": location,
            "count": len(jobs),
            "provider_configured": linkedin_client.is_configured(),
            "results": jobs,
        }
    )


# ---------- ViewSets ----------

class JobViewSet(viewsets.ModelViewSet):
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # ✅ Only show jobs that belong to the logged-in user
        return Job.objects.filter(owner=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        # ✅ Automatically attach job.owner = current user
        job = serializer.save(owner=self.request.user)
        log_job_created(self.request.user, job)
        save_job_description(job)


    @action(detail=True, methods=["post"])
    def rank(self, request, pk=None):
        job = self.get_object()
        cands = list(
            Candidate.objects.filter(job=job).values("id", "name", "email", "resume_text")
        )

        rows = rank_fn(job.jd_text, cands, job.remove_stopwords, job.anonymize_pii)

        Ranking.objects.update_or_create(job=job, defaults={"results_json": rows})

        # 🔹 Existing: high-level event
        log_ranking_run(request.user, job, len(rows))

        # 🔹 NEW: detailed top-N analytics snapshot
        log_ranking_results(request.user, job, rows, top_n=10)

        return Response(rows)


    @action(detail=True, methods=["get"], url_path="export\.csv")
    def export_csv(self, request, pk=None):
        import csv, io
        from django.http import HttpResponse

        try:
            ranking_obj = Ranking.objects.get(job_id=pk, job__owner=request.user)
            ranking = ranking_obj.results_json
        except Ranking.DoesNotExist:
            return Response({"error": "No ranking yet"}, status=404)

        # get the job for logging
        try:
            job = Job.objects.get(pk=pk, owner=request.user)
        except Job.DoesNotExist:
            # should not normally happen if Ranking exists with that owner
            job = None

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Rank", "Name", "Email", "Score(0-1)", "TokenCount", "OverlapSkills"])
        for i, r in enumerate(ranking, start=1):
            w.writerow([
                i,
                r["name"],
                r["email"],
                f'{r["score"]:.6f}',
                r.get("tokenCount", ""),
                " | ".join(r.get("skillOverlap", [])),
            ])

        # 🔹 NEW: log CSV export to Mongo
        if job is not None:
            log_export_csv(request.user, job, results_count=len(ranking))

        resp = HttpResponse(buf.getvalue(), content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename=\"ranked_candidates.csv\"'
        return resp


class CandidateViewSet(viewsets.ModelViewSet):
    serializer_class = CandidateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # ✅ Restrict to candidates for jobs owned by the logged-in user
        job_id = self.request.query_params.get("job")
        qs = Candidate.objects.filter(job__owner=self.request.user)
        if job_id:
            qs = qs.filter(job_id=job_id)
        return qs.order_by("-id")

    def create(self, request, *args, **kwargs):
        file = request.FILES.get("file")
        data = request.data.copy()

        # ---------- 1) File upload path ----------
        if file:
            job_id = data.get("job")
            if not job_id:
                return Response({"error": "job is required"}, status=400)

            # ensure job ownership
            try:
                job = Job.objects.get(pk=job_id, owner=request.user)
            except Job.DoesNotExist:
                return Response({"error": "Invalid job"}, status=404)

            # extract text from uploaded file
            try:
                text = read_text_from_upload(file, file.name)
            except Exception as e:
                # you could also log parsed_ok=False here if you want
                return Response({"error": str(e)}, status=400)

            cand = Candidate.objects.create(
                job=job,
                name=data.get("name", ""),
                email=data.get("email", ""),
                resume_text=text,
                uploaded_file=file,
            )

            # FR7.1 – store parsed resume text in MongoDB
            save_parsed_resume(cand)

            # FR7.4 – log resume upload to Mongo analytics
            log_resume_uploaded(
                user=request.user,
                job=job,
                candidate=cand,
                source="file_upload",
                parsed_ok=True,
            )

            ser = self.get_serializer(cand)
            return Response(ser.data, status=201)

        # ---------- 2) JSON path (resume_text already in body) ----------
        ser = self.get_serializer(data=data)
        ser.is_valid(raise_exception=True)

        # validate job owner (keeps current behaviour)
        job = Job.objects.get(pk=ser.validated_data["job"].id, owner=request.user)

        self.perform_create(ser)
        cand = ser.instance  # Candidate created by serializer

        # FR7.1 – store parsed resume text in MongoDB
        save_parsed_resume(cand)

        # FR7.4 – log JSON-based resume creation
        log_resume_uploaded(
            user=request.user,
            job=job,
            candidate=cand,
            source="json",
            parsed_ok=True,
        )

        headers = self.get_success_headers(ser.data)
        return Response(ser.data, status=201, headers=headers)


    

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .ml_model import ranking_model

# ------------------------------------------------------
# FR4.1 — Predict ML Score using XGBoost
# ------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def predict_rank(request):
    try:
        features = request.data

        score = ranking_model.predict_score({
            "cosine_similarity": float(features["cosine"]),
            "sbert_similarity": float(features["sbert"]),
            "hard_skill_matches": int(features["hard_skills"]),
            "soft_skill_matches": int(features["soft_skills"]),
            "years_experience": int(features["experience"])
        })

        return Response({"ml_score": score}, status=200)

    except Exception as e:
        return Response({"error": str(e)}, status=400)


# ------------------------------------------------------
# FR4.3 — Retrain XGBoost model
# ------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def retrain_model(request):
    try:
        rows = request.data.get("training_data", [])
        ranking_model.train_model(rows)
        return Response({"message": "Model retrained successfully"}, status=200)
    except Exception as e:
        return Response({"error": str(e)}, status=400)
    

# ------------------------------------------------------
# Recruiter Analytics API
# ------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def recruiter_analytics(request):
    """
    Return aggregated analytics for the logged-in recruiter.
    """
    email = request.query_params.get("email") or None
    data = get_recruiter_summary(email)
    return Response(data, status=200)


# ------------------------------------------------------
# Frontend-driven analytics logging
# ------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def analytics_log_event(request):
    """
    Called by the frontend whenever a key action happens
    (job created, ranking run, CSV export, login).
    """
    event = (request.data.get("event") or "").strip()
    user_email = (request.data.get("email") or "").strip() or None
    if not event:
        return Response({"error": "Missing 'event' field"}, status=400)

    log_analytics_event(event, user_email=user_email)
    return Response({"ok": True}, status=200)



