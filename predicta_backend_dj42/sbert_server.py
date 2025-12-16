# sbert_server.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

app = FastAPI()

# Allow your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = "all-MiniLM-L6-v2"
model = SentenceTransformer(MODEL_NAME)


@app.post("/embed")
async def embed(request: Request):
    """
    Expected JSON body: { "texts": ["...", "..."] }
    Returns: { "embeddings": [[...], [...]], "dim": int, "model": str }
    """
    body = await request.json()

    texts = body.get("texts")
    if not isinstance(texts, list):
        raise HTTPException(status_code=400, detail="Field 'texts' must be a list")

    if not texts:
        return {"embeddings": [], "dim": 0, "model": MODEL_NAME}

    # Coerce everything to string
    texts = [str(t) for t in texts]

    try:
        embs = model.encode(texts, normalize_embeddings=True)
        embs_list = embs.tolist()
        dim = len(embs_list[0])
        return {"embeddings": embs_list, "dim": dim, "model": MODEL_NAME}
    except Exception as e:
        # 🔁 Safe fallback so frontend doesn't break in demo:
        # use simple 1D "length" embeddings if SBERT crashes.
        dummy = [[float(len(t))] for t in texts]
        return {
            "embeddings": dummy,
            "dim": 1,
            "model": f"{MODEL_NAME}-fallback",
        }
