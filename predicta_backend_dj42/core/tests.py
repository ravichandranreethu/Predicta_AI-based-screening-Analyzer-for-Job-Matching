from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from .models import Job

class SmokeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u@example.com", email="u@example.com", password="pw")
        self.client = APIClient()
        r = self.client.post("/api/auth/login", {"username":"u@example.com","password":"pw"})
        # djangorestframework-simplejwt expects 'email' by our LoginView based on username field mapping
        r = self.client.post("/api/auth/login", {"email":"u@example.com","password":"pw"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.token = r.json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_job_crud(self):
        r = self.client.post("/api/jobs", {"jd_text":"python django developer", "title":"JD 1"}, format="json")
        self.assertEqual(r.status_code, 201)
        job_id = r.json()["id"]
        r = self.client.get(f"/api/jobs/{job_id}")
        self.assertEqual(r.status_code, 200)
