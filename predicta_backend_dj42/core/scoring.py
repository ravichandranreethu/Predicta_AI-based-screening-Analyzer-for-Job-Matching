import math, re

STOP = set("""a an and are as at be by for from has have if in into is it its of on or that the to with you your about across
after against all also among because been before being between both but can did do does doing down during each else few further he her
here hers herself him himself his how i into itself just me more most my myself nor not now off once only other our ours ourselves out
over own same she should so some such than that their theirs them themselves then there these they this those through too under until
up very was we were what when where which while who whom why will with within without would you your yours yourself yourselves""".split())

SKILL_ALIASES = {
  "python":["python"], "java":["java"], "javascript":["javascript","js"], "react":["react","react.js","reactjs"],
  "django":["django"], "flask":["flask"], "fastapi":["fastapi"], "spring":["spring","spring boot","spring-boot"],
  "nlp":["nlp","natural language processing"], "spacy":["spacy"], "nltk":["nltk"], "gensim":["gensim"],
  "bert":["bert"], "sentence-bert":["sentence-bert","sentence bert","sbert"], "xgboost":["xgboost"],
  "scikit-learn":["scikit-learn","scikit learn","sklearn"], "pandas":["pandas"], "numpy":["numpy"], "aws":["aws","s3","ec2","lambda"],
  "docker":["docker"], "rest api":["rest api","restful api","rest apis","rest services"]
}

def normalize(text, remove_stop=True):
    t = re.sub(r"[\u2018\u2019]", "'", text or "")
    t = re.sub(r'[\u201C\u201D]', '"', t).lower()
    t = re.sub(r"[^a-z0-9@.\-+ ]+", " ", t)
    toks = [x for x in t.split() if x]
    return [x for x in toks if x not in STOP] if remove_stop else toks

def anonymize(tokens):
    out = []
    for tok in tokens:
        if re.match(r"^[\w.+-]+@[\w.-]+\.[a-z]{2,}$", tok): out.append("<email>")
        elif re.match(r"^\d{4,}$", tok): out.append("<num>")
        else: out.append(tok)
    return out

def tf(tokens):
    m = {}
    for t in tokens: m[t] = m.get(t,0)+1
    return m

def build_idf(doc_tfs):
    df, N = {}, len(doc_tfs)
    for tfmap in doc_tfs:
        for t in tfmap.keys(): df[t] = df.get(t,0)+1
    return { t: math.log((N+1)/(df[t]+1))+1 for t in df }

def vectorize(tfmap, vocab, idf):
    return [(tfmap.get(t,0))*idf.get(t,1) for t in vocab]

def cosine(a,b):
    dot = sum(x*y for x,y in zip(a,b))
    na  = math.sqrt(sum(x*x for x in a)); nb = math.sqrt(sum(x*x for x in b))
    return (dot/(na*nb)) if na and nb else 0.0

def extract_skills(text):
    n = re.sub(r"[_/]", " ", (text or "").lower())
    n = re.sub(r"-", " ", n)
    hits=set()
    for canon, aliases in SKILL_ALIASES.items():
        patt = r"\b(?:%s)\b" % ("|".join(map(re.escape, aliases)))
        if re.search(patt, n): hits.add(canon)
    return sorted(hits)

def rank(jd_text, candidates, remove_stop=True, pii=True):
    jd_toks0 = normalize(jd_text, remove_stop)
    jd_toks  = anonymize(jd_toks0) if pii else jd_toks0
    jd_tf    = tf(jd_toks)

    res_data = []
    res_tfs  = []
    for c in candidates:
        toks0 = normalize(c["resume_text"], remove_stop)
        toks  = anonymize(toks0) if pii else toks0
        tff   = tf(toks)
        res_tfs.append(tff)
        res_data.append({**c, "tokens": toks, "tf": tff})

    idf   = build_idf([jd_tf, *res_tfs])
    vocab = list(idf.keys())
    v_jd  = vectorize(jd_tf, vocab, idf)
    jd_weights = sorted(
        [{"term":t, "weight":w} for t,w in zip(vocab, v_jd) if w>0],
        key=lambda x: x["weight"], reverse=True
    )
    jd_top = [x["term"] for x in jd_weights[:30]]

    rows = []
    for r in res_data:
        v_r = vectorize(r["tf"], vocab, idf)
        score = cosine(v_jd, v_r)
        weights = sorted(
            [{"term":t, "weight":w} for t,w in zip(vocab, v_r) if w>0],
            key=lambda x: x["weight"], reverse=True
        )
        rows.append({
            "id": r["id"], "name": r.get("name") or "Unnamed", "email": r.get("email",""),
            "score": score, "tokenCount": len(r["tokens"]),
            "termWeights": weights, "jdTopTerms": jd_top, "resumeTerms": list(set(r["tokens"])),
            "skillOverlap": extract_skills(candidates[res_data.index(r)]["resume_text"])
        })
    rows.sort(key=lambda x: x["score"], reverse=True)
    return rows
