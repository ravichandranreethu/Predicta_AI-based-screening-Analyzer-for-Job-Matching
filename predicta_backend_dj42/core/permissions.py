from rest_framework.permissions import BasePermission

class IsOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        # Job owner or related through foreign key
        job = getattr(obj, "job", None)
        if job:
            return job.owner_id == request.user.id
        return getattr(obj, "owner_id", None) == request.user.id
