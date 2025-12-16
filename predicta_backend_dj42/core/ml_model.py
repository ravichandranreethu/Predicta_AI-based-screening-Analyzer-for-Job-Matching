# ml_model.py
# ml_model.py
import os
import xgboost as xgb
import numpy as np
from django.conf import settings


MODEL_PATH = os.path.join(settings.BASE_DIR, "xgb_model.json")

FEATURE_ORDER = [
    "cosine_similarity",
    "sbert_similarity",
    "hard_skill_matches",
    "soft_skill_matches",
    "years_experience"
]

class RankingModel:

    def __init__(self):
        self.model = None
        self.load_model()

    def load_model(self):
        """Load the XGBoost model if it exists."""
        if os.path.exists(MODEL_PATH):
            self.model = xgb.XGBRegressor()
            self.model.load_model(MODEL_PATH)
        else:
            self.model = None

    def predict_score(self, features: dict):
        """
        Predict ranking score from frontend-extracted features.
        """
        if self.model is None:
            raise ValueError("XGBoost model not found. Train it first.")

        x = np.array([[features[f] for f in FEATURE_ORDER]])
        score = float(self.model.predict(x)[0])
        return score

    def train_model(self, rows):
        """
        Retrain XGBoost model with new feature rows.
        Each row must be:
        {
          "cosine_similarity": 0.91,
          "sbert_similarity": 0.88,
          "hard_skill_matches": 5,
          "soft_skill_matches": 3,
          "years_experience": 4,
          "label": 0.92
        }
        """
        X, y = [], []

        for r in rows:
            X.append([r[f] for f in FEATURE_ORDER])
            y.append(r["label"])

        X = np.array(X)
        y = np.array(y)

        model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="reg:squarederror"
        )

        model.fit(X, y)
        model.save_model(MODEL_PATH)
        self.model = model
        return True


ranking_model = RankingModel()

