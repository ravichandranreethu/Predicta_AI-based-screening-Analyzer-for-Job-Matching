from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer
import numpy as np

app = FastAPI(title="Predicta Embedding Service")
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Choose a fast, high-quality model
# all-MiniLM-L6-v2 (384-dim) is a solid default for speed+quality
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
model = SentenceTransformer(MODEL_NAME)

class EmbedRequest(BaseModel):
    texts: List[str]

class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dim: int
    model: str

@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    # Inference
    vecs = model.encode(req.texts, normalize_embeddings=True)  # cosine ready
    return EmbedResponse(
        embeddings=[v.tolist() for v in vecs],
        dim=int(vecs.shape[1]),
        model=MODEL_NAME
    )
