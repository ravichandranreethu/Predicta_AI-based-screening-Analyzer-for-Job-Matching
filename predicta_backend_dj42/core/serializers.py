from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Job, Candidate, Ranking

class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='first_name', required=False, allow_blank=True)
    class Meta:
        model = User
        fields = ["id", "username", "email", "name"]

class SignupSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def create(self, validated_data):
        name = validated_data.get("name","")
        email = validated_data["email"].lower()
        password = validated_data["password"]
        user = User.objects.create_user(
            username=email, email=email, password=password, first_name=name
        )
        return user

class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = ["id", "title", "jd_text", "remove_stopwords", "anonymize_pii", "created_at"]

class CandidateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidate
        fields = ["id", "job", "name", "email", "resume_text", "uploaded_file", "created_at"]
        read_only_fields = ["uploaded_file", "created_at"]

class RankingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ranking
        fields = ["id", "job", "results_json", "created_at"]
