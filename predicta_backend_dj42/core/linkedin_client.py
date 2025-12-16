# core/linkedin_client.py
"""
Option B – LinkedIn job data integration layer.

This module is written so that you can plug in:
- LinkedIn Talent Solutions APIs (enterprise)
- or a legal third-party API that surfaces LinkedIn job data.

For now, we implement a "mock" provider so FR7.3 is satisfied:
the system has a clear integration point for external job APIs.
"""

import os
from typing import List, Dict, Any
import requests


class LinkedInClient:
    """
    Thin wrapper around an external LinkedIn-like jobs API.

    In a real deployment you would:
    - store API keys in .env
    - handle OAuth / headers according to provider docs
    - map provider fields -> internal Job schema
    """

    def __init__(self):
        # Example: endpoint & key from .env (adapt names as needed)
        self.base_url = os.getenv("LINKEDIN_API_BASE", "").rstrip("/")
        self.api_key = os.getenv("LINKEDIN_API_KEY", "")

    def is_configured(self) -> bool:
        """Return True if we have enough config to call a real API."""
        return bool(self.base_url and self.api_key)

    def _headers(self) -> Dict[str, str]:
        """
        Build auth headers for your provider.

        For a real provider, replace this with their required headers.
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    # ----------------------------------------------------------
    # Public API used by your Django views
    # ----------------------------------------------------------
    def search_jobs(self, query: str, location: str = "", limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search jobs on LinkedIn / external provider.

        Returns a list of simplified job dicts that your frontend can use.

        For now:
        - if not configured, fall back to a mocked response (good for demo).
        """
        if not self.is_configured():
            # --- Mocked data for your project demo ---
            return self._mock_search_jobs(query, location, limit)

        # --- Real integration path (when you have a provider) ---
        params = {
            "q": query,
            "location": location,
            "limit": limit,
        }
        url = f"{self.base_url}/jobs/search"

        resp = requests.get(url, headers= self.headers(), params=params, timeout=10)
        resp.raise_for_status()
        raw_jobs = resp.json().get("results", [])

        # Map provider fields -> internal format
        return [self._normalize_job(j) for j in raw_jobs]

    # ----------------------------------------------------------
    # Helpers
    # ----------------------------------------------------------
    def _normalize_job(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert API provider job JSON into a common schema.

        Adjust the mapping based on the actual provider you end up using.
        """
        return {
            "external_id": raw.get("id"),
            "title": raw.get("title"),
            "company": raw.get("company_name") or raw.get("company"),
            "location": raw.get("location"),
            "description": raw.get("description") or "",
            "url": raw.get("url") or raw.get("apply_link"),
            "source": "linkedin",  # for analytics / tracking
        }

    def _mock_search_jobs(self, query: str, location: str, limit: int) -> List[Dict[str, Any]]:
        """
        Simple mock data when no real LinkedIn API is configured.
        Use this in demos to show FR7.3 support.
        """
        return [
            {
                "external_id": "lnkd-001",
                "title": f"{query} Engineer",
                "company": "LinkedIn (Mock)",
                "location": location or "Remote",
                "description": f"Mock job for '{query}' from LinkedIn integration layer.",
                "url": "https://www.linkedin.com/jobs/view/123456789",
                "source": "linkedin-mock",
            },
            {
                "external_id": "lnkd-002",
                "title": f"Senior {query} Developer",
                "company": "Example Corp",
                "location": location or "Hybrid",
                "description": f"Another mock LinkedIn job for '{query}'.",
                "url": "https://www.linkedin.com/jobs/view/987654321",
                "source": "linkedin-mock",
            },
        ][:limit]


# Singleton instance used by views
linkedin_client = LinkedInClient()