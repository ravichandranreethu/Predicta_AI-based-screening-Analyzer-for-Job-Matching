// app.js
/* Minimal in-browser pipeline:
 * - Tokenize & normalize JD and resume texts
 * - Optional stopwords removal + basic PII anonymization
 * - Build TF-IDF vectors and compute cosine similarity
 * - Extract skill overlaps from a curated skill list
 * - Rank candidates, render cards, show explainability modal, export CSV
 */

// ----- Simple stopwords -----
const STOPWORDS = new Set(("a an and are as at be by for from has have if in into is it its of on or that the to with you your " +
"about across after against all also among because been before being between both but can did do does doing down during each else few " +
"further he her here hers herself him himself his how i into itself just me more most my myself nor not now off once only other our ours ourselves out over own same she should so some such than that their theirs them themselves then there these they this those through too under until up very was we were what when where which while who whom why will with within without would you your yours yourself yourselves").split(" "));

// ----- Minimal skill dictionary (extend as needed) -----
// Canonical skill -> list of aliases/variants (add more anytime)
const SKILL_ALIASES = {
    "python": ["python"],
    "java": ["java"],
    "javascript": ["javascript", "js"],
    "typescript": ["typescript", "ts"],
    "react": ["react", "react.js", "reactjs"],
    "angular": ["angular", "angular.js", "angularjs"],
    "vue": ["vue", "vue.js", "vuejs"],
    "node.js": ["node", "node.js", "nodejs", "express", "express.js"],
    "django": ["django"],
    "flask": ["flask"],
    "fastapi": ["fastapi"],
    "spring": ["spring", "spring boot", "spring-boot"],
    "nlp": ["nlp", "natural language processing"],
    "spacy": ["spacy"],
    "nltk": ["nltk"],
    "gensim": ["gensim"],
    "bert": ["bert"],
    "sentence-bert": ["sentence-bert", "sentence bert", "sbert"],
    "xgboost": ["xgboost"],
    "scikit-learn": ["scikit-learn", "scikit learn", "sklearn"],
    "pandas": ["pandas"],
    "numpy": ["numpy"],
    "scipy": ["scipy"],
    "postgresql": ["postgresql", "postgres", "psql"],
    "mysql": ["mysql"],
    "mongodb": ["mongodb", "mongo"],
    "redis": ["redis"],
    "kafka": ["kafka", "apache kafka"],
    "elasticsearch": ["elasticsearch", "elastic search", "es"],
    "rest api": ["rest api", "restful api", "restful apis", "rest apis", "rest services"],
    "graphql": ["graphql"],
    "docker": ["docker"],
    "kubernetes": ["kubernetes", "k8s"],
    "aws": ["aws", "amazon web services", "s3", "ec2", "lambda"],
    "gcp": ["gcp", "google cloud"],
    "azure": ["azure", "microsoft azure"],
    "tensorflow": ["tensorflow", "tf"],
    "pytorch": ["pytorch", "torch"],
    "git": ["git", "gitlab", "github"],
    "streamlit": ["streamlit"],
    "tableau": ["tableau"],
    "power bi": ["powerbi", "power bi"],
    "linux": ["linux", "unix"],
    "bash": ["bash", "shell scripting", "shell script"],
    "spark": ["spark", "pyspark", "apache spark"],
    "hadoop": ["hadoop"],
    "airflow": ["airflow", "apache airflow"],
    "snowflake": ["snowflake"],
    "databricks": ["databricks"]
  };

  // Escape for regex
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Normalize text for skill matching: lowercase, unify hyphens/underscores, collapse spaces
function normalizeForSkills(text){
  return (text || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/[_/]/g, " ")
    .replace(/-/g, " ")             // treat hyphen and space the same (scikit learn)
    .replace(/\s+/g, " ");
}

// Precompile regex patterns once
const SKILL_PATTERNS = Object.entries(SKILL_ALIASES).map(([canon, aliases])=>{
  const alts = aliases.map(escRe).join("|");
  // \b word boundaries around the whole alias, after hyphen/space normalization
  const re = new RegExp(`\\b(?:${alts})\\b`, "i");
  return { canon, re };
});

// NEW: robust extractor (returns a sorted, deduped array)
function extractSkills(text){
  const norm = normalizeForSkills(text);
  const hits = new Set();
  for (const {canon, re} of SKILL_PATTERNS){
    if (re.test(norm)) hits.add(canon);
  }
  return Array.from(hits).sort();
}

// ----- SOFT SKILLS -----
const SOFT_SKILL_ALIASES = {
  "communication": ["communication", "communicator", "communicating"],
  "teamwork": ["teamwork", "team player", "collaboration", "collaborative"],
  "leadership": ["leadership", "leading teams", "team lead"],
  "problem solving": ["problem solving", "problem-solver", "analytical thinking"],
  "time management": ["time management", "managing time", "prioritization"],
  "adaptability": ["adaptability", "adaptable", "flexible", "flexibility"],
  "creativity": ["creativity", "creative thinking"],
  "critical thinking": ["critical thinking"],
  "attention to detail": ["attention to detail", "detail-oriented", "detail oriented"],
  "decision making": ["decision making", "decision-making"],
  "presentation": ["presentation skills", "presentations", "public speaking"],
  "mentoring": ["mentoring", "coaching"],
  "customer focus": ["customer focus", "customer-centric", "client focus", "client-facing"]
};

const SOFT_SKILL_PATTERNS = Object.entries(SOFT_SKILL_ALIASES).map(([canon, aliases]) => {
  const alts = aliases.map(escRe).join("|");
  const re = new RegExp(`\\b(?:${alts})\\b`, "i");
  return { canon, re };
});

function extractSoftSkills(text){
  const norm = normalizeForSkills(text || "");
  const hits = new Set();
  for (const { canon, re } of SOFT_SKILL_PATTERNS){
    if (re.test(norm)) hits.add(canon);
  }
  return Array.from(hits).sort();
}

// ----- EDUCATION & CERTIFICATIONS -----
const EDUCATION_PATTERNS = [
  { label: "Bachelor's", re: /\b(bachelor(?:'s)?|b\.sc\.?|b\.s\.?|btech|b\.tech|b\.e\.)\b/i },
  { label: "Master's",   re: /\b(master(?:'s)?|m\.sc\.?|m\.s\.?|mtech|m\.tech|m\.eng)\b/i },
  { label: "PhD",        re: /\b(ph\.?d\.?|doctorate|doctoral)\b/i },
  { label: "Diploma",    re: /\b(diploma)\b/i },
  { label: "High School",re: /\b(high school|secondary school)\b/i }
];

const CERT_PATTERNS = [
  { label: "AWS Certified",         re: /\baws certified\b/i },
  { label: "Azure Certification",   re: /\bazure (fundamentals|administrator|developer)\b/i },
  { label: "GCP Certification",     re: /\bgoogle cloud (professional|associate)\b/i },
  { label: "PMP",                   re: /\bpmp\b/i },
  { label: "Scrum Master",          re: /\bscrum master\b/i },
  { label: "Oracle Certification",  re: /\boracle certified\b/i },
  { label: "Cisco Certification",   re: /\b(ccna|ccnp|cisco certified)\b/i }
];

function extractEducationCerts(text){
  const t = text || "";
  const education = new Set();
  const certs = new Set();

  EDUCATION_PATTERNS.forEach(p => {
    if (p.re.test(t)) education.add(p.label);
  });
  CERT_PATTERNS.forEach(p => {
    if (p.re.test(t)) certs.add(p.label);
  });

  return {
    education: Array.from(education).sort(),
    certifications: Array.from(certs).sort()
  };
}

// ----- JOB ROLES & EXPERIENCE -----
const JOB_TITLES = [
  "software engineer",
  "senior software engineer",
  "backend engineer",
  "frontend engineer",
  "full stack developer",
  "data scientist",
  "machine learning engineer",
  "ml engineer",
  "data engineer",
  "devops engineer",
  "site reliability engineer",
  "sre",
  "project manager",
  "product manager",
  "business analyst",
  "qa engineer",
  "test engineer",
  "research assistant",
  "intern"
];

function extractJobInfo(text){
  const norm = " " + normalizeForSkills(text || "") + " ";
  const roles = new Set();

  JOB_TITLES.forEach(title => {
    const pattern = " " + title + " ";
    if (norm.includes(pattern)) roles.add(title);
  });

  // crude "X years of experience" detector – pick the max
  let maxYears = null;
  const expRe = /(\d+)\+?\s*(years|yrs)\s+(of\s+)?experience/gi;
  let m;
  while ((m = expRe.exec(text)) !== null){
    const val = parseInt(m[1], 10);
    if (!isNaN(val)){
      if (maxYears == null || val > maxYears) maxYears = val;
    }
  }

  return {
    jobTitles: Array.from(roles).sort(),
    yearsOfExperience: maxYears  // may be null
  };
}

// ----- State -----
const LS_JD_SIG = "ai_last_jd_signature";
let candidates = []; // { id, name, email, resumeText }
let lastResults = []; // ranked output for CSV
let analyticsChart = null;  // Chart.js instance for recruiter analytics
let lastJDSignature = localStorage.getItem(LS_JD_SIG) || null;
// ----- Helpers -----
const $ = sel => document.querySelector(sel);
const escapeHtml = s =>
  s.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

// ----- Per-user localStorage keys -----
// We read the currently logged-in user from Auth (auth.js)
const session = (typeof Auth !== "undefined" && Auth.getSession && Auth.getSession()) || null;
const userKey = session && session.email ? session.email.toLowerCase() : "guest";

const LS_CANDIDATES = `ai_candidates_v1_${userKey}`;
const LS_JD         = `ai_jd_v1_${userKey}`;
const LS_SETTINGS   = `ai_settings_v1_${userKey}`;
const LS_AUDIT      = `ai_audit_log_v1_${userKey}`;  // FR5.3 audit log


function loadAuditLog(){
  try { return JSON.parse(localStorage.getItem(LS_AUDIT)) || []; }
  catch { return []; }
}
function saveAuditLog(entries){
  localStorage.setItem(LS_AUDIT, JSON.stringify(entries));
}

// Append one entry, cap at last 25 runs
function appendAuditEntry(entry){
  const log = loadAuditLog();
  log.push(entry);
  while (log.length > 25) log.shift();
  saveAuditLog(log);
}


function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function loadJSON(key, fallback){ 
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function readAsArrayBuffer(file){
    return new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsArrayBuffer(file);
    });
  }
  function stripHtml(html){
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  }
  async function extractTextFromFile(file){
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "txt") return await file.text();
    if (ext === "docx") {
      const buf = await readAsArrayBuffer(file);
      const r = await window.mammoth.convertToHtml({ arrayBuffer: buf });
      return stripHtml(r.value).trim();
    }
    if (ext === "pdf") {
      const buf = await readAsArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let out = "";
      for (let p = 1; p <= pdf.numPages; p++){
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        out += tc.items.map(i => i.str).join(" ") + "\n";
      }
      return out.trim();
    }
    throw new Error(`Unsupported type .${ext}. Use .txt, .pdf, or .docx`);
  }

// Normalize & tokenize
function normalize(text, removeStop=true){
  const lowered = (text||"")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"')
    .replace(/[^a-z0-9@.\-+ ]+/g," "); // keep email-ish tokens pre-anonymization
  const tokens = lowered.split(/\s+/).filter(Boolean);
  return removeStop ? tokens.filter(t=>!STOPWORDS.has(t)) : tokens;
}

// Basic PII anonymization (names/emails/numbers)
function anonymize(tokens){
  return tokens.map(tok=>{
    if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/.test(tok)) return "<email>";
    if (/^\d{4,}$/.test(tok)) return "<num>";
    return tok;
  });
}

// TF
function termFreq(tokens){
  const tf = new Map();
  tokens.forEach(t=>tf.set(t, (tf.get(t)||0)+1));
  return tf;
}

// Build vocabulary & IDF
function buildIdf(docs){
  const df = new Map();
  docs.forEach(doc=>{
    const seen = new Set(doc.keys());
    seen.forEach(t=>df.set(t,(df.get(t)||0)+1));
  });
  const N = docs.length;
  const idf = new Map();
  df.forEach((v,t)=>idf.set(t, Math.log((N+1)/(v+1))+1));
  return idf;
}

// Vectorize TF-IDF into dense array over a shared vocab
function vectorize(tf, vocab, idf){
  return vocab.map(t => (tf.get(t)||0) * (idf.get(t)||1));
}

// Cosine similarity
function cosine(a,b){
  let dot=0, na=0, nb=0;
  for(let i=0;i<a.length;i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return (na&&nb)? (dot / (Math.sqrt(na)*Math.sqrt(nb))) : 0;
}

async function fetchEmbeddings(texts){
  const res = await fetch("http://127.0.0.1:8001/embed", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ texts })
  });
  if(!res.ok) throw new Error(`Embedding API error: ${res.status}`);
  const data = await res.json(); // { embeddings: number[][], dim, model }
  return data.embeddings; // already L2-normalized
}

function cosineNormed(a, b){
  // vectors from SBERT are normalized (dot product == cosine)
  let s = 0;
  for (let i=0;i<a.length;i++) s += a[i]*b[i];
  return s;
}

// ---------- FR7.3: External LinkedIn job search (frontend) ----------

// ---------- FR7.3: External LinkedIn job search (frontend) ----------
async function apiSearchLinkedInJobs(query, location, limit = 5) {
  const params = new URLSearchParams({
    q: query || "",
    location: location || "",
    limit: String(limit),
  });

  const resp = await fetch(
    `http://127.0.0.1:8000/api/external/linkedin-search/?${params.toString()}`, 
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
      }
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `LinkedIn search failed: ${resp.status}`);
  }

  return resp.json();
}



function renderLinkedInResults(data, container) {
  const results = (data && data.results) || [];

  if (!results.length) {
    container.innerHTML = `<p>No external jobs found for this query.</p>`;
    return;
  }

  const itemsHtml = results
    .map(job => {
      const title = escapeHtml(job.title || "");
      const company = escapeHtml(job.company || "");
      const location = escapeHtml(job.location || "");
      const desc = escapeHtml(job.description || "");
      const url = job.url || "#";
      const source = escapeHtml(job.source || "linkedin-mock");

      return `
        <article class="linkedin-job-card">
          <h3>${title}</h3>
          <p><strong>${company}</strong> · ${location}</p>
          <p class="job-desc">${desc}</p>
          <p class="job-meta">Source: ${source}</p>
          <a href="${url}" target="_blank" rel="noopener noreferrer">View job</a>
        </article>
      `;
    })
    .join("");

  container.innerHTML = itemsHtml;
}

async function onLinkedInSearchClick() {
  const qInput   = document.getElementById("linkedin-q");
  const locInput = document.getElementById("linkedin-location");
  const limInput = document.getElementById("linkedin-limit");
  const outDiv   = document.getElementById("linkedin-results");

  if (!outDiv) {
    console.warn("⚠️ #linkedin-results container not found");
    return;
  }

  const query    = (qInput?.value || "Python").trim();
  const location = (locInput?.value || "Remote").trim();
  const limit    = parseInt(limInput?.value || "5", 10) || 5;

  outDiv.innerHTML = `<p>Searching external jobs for <strong>${escapeHtml(query)}</strong> in <strong>${escapeHtml(location)}</strong>...</p>`;

  try {
    const data = await apiSearchLinkedInJobs(query, location, limit);
    renderLinkedInResults(data, outDiv);
  } catch (err) {
    console.error(err);
    outDiv.innerHTML = `<p class="error">External job search failed: ${escapeHtml(err.message)}</p>`;
  }
}


// Render utilities
function renderCandidateList(){
    const list = document.querySelector("#candidateList");
    if (!list) { console.warn("❌ #candidateList not found"); return; }
  
    if (!candidates || candidates.length === 0){
      list.innerHTML = `<li class="muted" style="list-style:none;padding:8px 0">No candidates yet.</li>`;
      return;
    }
  
    list.innerHTML = "";
    candidates.forEach(c=>{
      const li = document.createElement("li");
      li.innerHTML = `
        <div><strong>${escapeHtml(c.name || "Unnamed")}</strong>
          <span class="muted">${escapeHtml(c.email || "")}</span></div>
        <div class="kv">
          <span class="pill">${extractSkills(c.resumeText).length} skills</span>
        </div>
        <div class="actions">
          <button class="icon-btn" data-act="peek" data-id="${c.id}">Peek</button>
          <button class="icon-btn" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="icon-btn" data-act="remove" data-id="${c.id}">Remove</button>
        </div>`;
      list.appendChild(li);
    });
  
    list.querySelectorAll("button[data-act='remove']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const cid = btn.getAttribute("data-id");
        candidates = candidates.filter(x=>x.id !== cid);
        try { localStorage.setItem("ai_candidates_v1", JSON.stringify(candidates)); } catch {}
        renderCandidateList();
      });
    });

    list.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const cid = btn.getAttribute("data-id");
        const c = candidates.find(x=>x.id===cid);
        if(!c) return;
        openEditor(c);
      });
    });    
  
    list.querySelectorAll("button[data-act='peek']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const cid = btn.getAttribute("data-id");
        const c = candidates.find(x=>x.id === cid);
        if (!c) return;
        openExplainModal(`${c.name} — Resume Preview`,
          `<pre style="white-space:pre-wrap">${escapeHtml(c.resumeText.slice(0,2000))}</pre>`);
      });
    });
  }

function progressBar(pct){
  return `<div class="bar"><span style="width:${(pct*100).toFixed(1)}%"></span></div>`;
}

function renderResults(rows){
  const box = $("#results");
  box.innerHTML = "";
  rows.forEach((r, idx)=>{
    const card = document.createElement("div");
    const topSkills = r.skillOverlap.slice(0,6).map(s=>`<span class="pill good">${escapeHtml(s)}</span>`).join("");
    const missing = r.jdTopTerms.filter(t=>!r.resumeTerms.has(t)).slice(0,6).map(s=>`<span class="pill warn">${escapeHtml(s)}</span>`).join("");
    
    const softHtml = r.softSkills && r.softSkills.length
      ? r.softSkills.slice(0,4).map(s=>`<span class="pill">${escapeHtml(s)}</span>`).join("")
      : '<span class="pill">Soft skills: —</span>';

    const eduParts = [];
    if (r.education && r.education.length) eduParts.push("Edu: " + r.education.join(", "));
    if (r.certifications && r.certifications.length) eduParts.push("Certs: " + r.certifications.join(", "));
    const eduText = eduParts.join(" | ") || "Education & certs: —";

    const rolesText = (r.jobTitles && r.jobTitles.length)
      ? "Roles: " + r.jobTitles.join(", ")
      : "Roles: —";
    const expText = (r.yearsOfExperience != null)
      ? `~${r.yearsOfExperience}+ yrs`
      : "Experience: n/a";

    card.className = "card";
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="badge">Rank #${idx+1}</div>
          <h3 style="margin:.2rem 0">${escapeHtml(r.name)}</h3>
          <div class="muted">${escapeHtml(r.email || "—")}</div>
        </div>
        <div class="score">${(r.score*100).toFixed(1)}%</div>
      </div>
      ${progressBar(r.score)}
      <div class="kv">
        <span class="pill">Tokens: ${r.tokenCount}</span>
        <span class="pill">Overlap: ${r.skillOverlap.length}</span>
      </div>
      <div class="kv">${topSkills || '<span class="pill">No explicit skills matched</span>'}</div>
      <div class="kv">${missing ? ('<span class="pill">Gaps:</span>'+missing) : ''}</div>
      <div class="kv">
        ${softHtml}
      </div>
      <!-- Skill Gap Analyzer UI -->
      <div class="kv skill-gap-block">
        <span class="pill">Missing hard skills:</span>
        ${
          (r.missingHardSkills && r.missingHardSkills.length)
            ? r.missingHardSkills
                .slice(0, 6)
                .map(s => `<span class="pill warn">${escapeHtml(s)}</span>`)
                .join("")
            : '<span class="pill good">None</span>'
        }
      </div>
      <div class="kv skill-gap-block">
        <span class="pill">Missing soft skills:</span>
        ${
          (r.missingSoftSkills && r.missingSoftSkills.length)
            ? r.missingSoftSkills
                .slice(0, 6)
                .map(s => `<span class="pill warn">${escapeHtml(s)}</span>`)
                .join("")
            : '<span class="pill good">None</span>'
        }
      </div>

      <div class="kv">
        <span class="pill">${escapeHtml(eduText)}</span>
        <span class="pill">${escapeHtml(rolesText)}</span>
        <span class="pill">${escapeHtml(expText)}</span>
      </div>
  
      <div class="actions">
        <button class="btn ghost" data-act="explain" data-id="${r.id}">Explain</button>
      </div>
    `;
    box.appendChild(card);
  });

  document.querySelectorAll("button[data-act='explain']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const cid = btn.getAttribute("data-id");
      const row = rows.find(x => x.id === cid);
      if (!row) return;
      const top = row.termWeights.slice(0,12)
        .map(x=>`<tr><td>${escapeHtml(x.term)}</td><td>${x.weight.toFixed(3)}</td></tr>`)
        .join("");
      const softStr = row.softSkills && row.softSkills.length
        ? row.softSkills.join(", ")
        : "—";

      const eduStr = (row.education && row.education.length) ? row.education.join(", ") : "—";
      const certStr = (row.certifications && row.certifications.length) ? row.certifications.join(", ") : "—";
      const rolesStr = (row.jobTitles && row.jobTitles.length) ? row.jobTitles.join(", ") : "—";
      const expStr = (row.yearsOfExperience != null) ? `~${row.yearsOfExperience}+ years` : "n/a";

      const body = `
      <p><strong>Why this score?</strong> Combined ML score using similarity & features (TF-IDF/SBERT, skills, experience) with XGBoost.</p>
      <p><strong>Skill overlap:</strong> ${row.skillOverlap.map(s=>`<code>${escapeHtml(s)}</code>`).join(", ") || "—"}</p>
      <p><strong>Soft skills:</strong> ${escapeHtml(softStr)}</p>
      <p><strong>Education:</strong> ${escapeHtml(eduStr)}<br/>
         <strong>Certifications:</strong> ${escapeHtml(certStr)}</p>
      <p><strong>Roles & experience:</strong> ${escapeHtml(rolesStr)} (${escapeHtml(expStr)})</p>
      <h4>Top contributing resume terms</h4>
      <table><thead><tr><th>Term</th><th>TF-IDF</th></tr></thead><tbody>${top}</tbody></table>
    `;
      openExplainModal(`Explain: ${row.name}`, body);
    });
  });
}

function openExplainModal(title, html){
  const dlg = $("#explainModal");
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  dlg.showModal();
}

function openEditor(cand){
  const dlg = document.querySelector("#editorModal");
  document.querySelector("#editorName").value  = cand.name || "";
  document.querySelector("#editorEmail").value = cand.email || "";
  document.querySelector("#editorText").value  = cand.resumeText || "";
  dlg.dataset.id = cand.id;
  dlg.showModal();
}

// Compute TF-IDF scores for a given JD token list and resume token lists
function computeTfIdfScores(jdTokens, resumeTokensList){
  const jdTf      = termFreq(jdTokens);
  const resumeTFs = resumeTokensList.map(tokens => termFreq(tokens));
  const idf       = buildIdf([jdTf, ...resumeTFs]);
  const vocab     = Array.from(idf.keys());
  const vJD       = vectorize(jdTf, vocab, idf);

  const scores = resumeTokensList.map(tokens => {
    const tf  = termFreq(tokens);
    const vR  = vectorize(tf, vocab, idf);
    const sc  = cosine(vJD, vR);
    return { tokens, tf, vR, score: sc };
  });

  return { scores, vocab, idf, vJD };
}

// Update fairness summary box under the dashboard
function updateFairnessSummary(info){
  const box = document.getElementById("fairnessSummary");
  if (!box) return;
  if (!info){
    box.innerHTML = `<strong>Fairness:</strong> Run a ranking to see anonymization impact.`;
    return;
  }
  const { modeUsed, avgShift, maxShift, maxShiftName, total, note } = info;
  box.innerHTML = `
    <strong>Fairness:</strong>
    Using <code>${modeUsed}</code> scores for final ranking.
    Analysed ${total} candidate(s).<br/>
    Avg |score difference| = ${(avgShift*100).toFixed(2)} pts,
    max = ${(maxShift*100).toFixed(2)} pts (candidate: ${escapeHtml(maxShiftName||"n/a")}).<br/>
    <span class="muted small">${note}</span>
  `;
}

// Show audit log inside Explain modal (re-uses existing dialog)
function showAuditLog(){
  const log = loadAuditLog();
  if (!log.length){
    openExplainModal("Audit log", "<p>No audit entries yet. Run a few rankings first.</p>");
    return;
  }
  const rows = log.slice().reverse().map((e, idx) => {
    const ts = new Date(e.ts).toLocaleString();
    const tops = (e.top || []).map(t => `${escapeHtml(t.name)} (${(t.score*100).toFixed(1)}%)`).join(", ");
    const fair = e.fair ? "ON" : "OFF";
    const sbert = e.useSBERT ? "SBERT" : "TF-IDF";
    const note = e.fairness && e.fairness.note ? e.fairness.note : "";
    return `
      <tr>
        <td>${idx+1}</td>
        <td>${ts}</td>
        <td>${e.numCandidates}</td>
        <td>${e.jdLen}</td>
        <td>${fair}</td>
        <td>${sbert}</td>
        <td>${(e.fairness?.avgShift*100 || 0).toFixed(2)}</td>
        <td>${(e.fairness?.maxShift*100 || 0).toFixed(2)}</td>
        <td>${escapeHtml(note)}</td>
      </tr>`;
  }).join("");

  const body = `
    <p class="muted small">
      Each row is one ranking run, stored locally in <code>localStorage</code>.
      It captures settings, fairness metrics (difference between PII vs anonymized scores),
      and a short note about potential bias.
    </p>
    <table style="width:100%;font-size:12px;border-collapse:collapse">
      <thead>
        <tr>
          <th>#</th><th>Timestamp</th><th>Cands</th><th>JD chars</th>
          <th>PII toggle</th><th>Mode</th>
          <th>Avg |Δscore|</th><th>Max |Δscore|</th><th>Note</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  openExplainModal("Audit log (fairness & decisions)", body);
}

// ----- Ranking pipeline -----
async function rank() {
  const jdRaw = $("#jdInput").value.trim();
  if (!jdRaw) { alert("Please paste a Job Description first."); return; }
    // Normalize JD text to detect when it actually changes (for analytics)
    const jdSignature = jdRaw.toLowerCase().replace(/\s+/g, " ").trim();

  if (candidates.length === 0) { alert("Please add at least one candidate."); return; }

  const stop     = $("#stopwordsToggle").checked;
  const fair     = $("#fairToggle").checked;
  const useSBERT = $("#sbertToggle")?.checked;
    // --- JD skill profile for Skill Gap Analyzer ---
    const jdHardSkills = extractSkills(jdRaw);       // technical skills from JD
    const jdSoftSkills = extractSoftSkills(jdRaw);   // soft skills from JD
  

  // --- 1. Base vs anonymized tokens (for fairness) ---
  const jdTokensBase = normalize(jdRaw, stop);
  const jdTokensAnon = anonymize(jdTokensBase);

  const resumeTokensBase = candidates.map(c => normalize(c.resumeText, stop));
  const resumeTokensAnon = resumeTokensBase.map(tokens => anonymize(tokens));

  let rows = [];
  let fairnessInfo = null;

  try {
    // --- 2. Fairness metrics in TF-IDF space (raw vs anonymized) ---
    let tfFairness = null;
    try {
      const baseRun = computeTfIdfScores(jdTokensBase, resumeTokensBase);
      const anonRun = computeTfIdfScores(jdTokensAnon, resumeTokensAnon);

      const diffs = candidates.map((c, i) => ({
        id: c.id,
        name: c.name || "Unnamed",
        base: baseRun.scores[i].score,
        anon: anonRun.scores[i].score,
        delta: anonRun.scores[i].score - baseRun.scores[i].score,
        absDelta: Math.abs(anonRun.scores[i].score - baseRun.scores[i].score)
      }));

      const total    = diffs.length || 1;
      const avgShift = diffs.reduce((s,d)=>s+d.absDelta,0) / total;
      const maxItem  = diffs.reduce(
        (best,d)=> d.absDelta > best.absDelta ? d : best,
        { absDelta:-1, name:"" }
      );
      const maxShift     = maxItem.absDelta || 0;
      const maxShiftName = maxItem.name || "";

      const THRESH_MAX = 0.10; // 10 pts
      const THRESH_AVG = 0.03; // 3 pts
      let note = "No strong evidence of PII-sensitive ranking shifts.";
      if (maxShift > THRESH_MAX || avgShift > THRESH_AVG){
        note = "Potential PII-driven sensitivity detected. Consider keeping anonymization ON.";
      }

      tfFairness = { avgShift, maxShift, maxShiftName, total, note };
    } catch (e) {
      console.warn("Fairness metric computation failed:", e);
    }

    // --- 3. Actual ranking (with FR2.2 + FR4.1 features) ---

    if (useSBERT) {
      // SBERT mode: ranking in semantic space, fairness measured in TF-IDF space
      const jdTokensForEmb = fair ? jdTokensAnon : jdTokensBase;
      const resumeForEmb   = (fair ? resumeTokensAnon : resumeTokensBase)
                                .map(toks => toks.join(" "));

      const payload = [jdTokensForEmb.join(" "), ...resumeForEmb];
      const embs    = await fetchEmbeddings(payload);
      const vJD     = embs[0];

      rows = [];
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const vR          = embs[i+1];
        const baseScore   = cosineNormed(vJD, vR);
        const tokensActive= (fair ? resumeTokensAnon : resumeTokensBase)[i];

        const softSkills  = extractSoftSkills(c.resumeText);
        const eduInfo     = extractEducationCerts(c.resumeText);
        const jobInfo     = extractJobInfo(c.resumeText);
        const skillOverlap= extractSkills(c.resumeText);
                // --- Skill Gap Analyzer (SBERT mode) ---
                const missingHardSkills = jdHardSkills.filter(s => !skillOverlap.includes(s));
                const missingSoftSkills = jdSoftSkills.filter(s => !(softSkills || []).includes(s));
        

        // ---- FR4.1: Call backend XGBoost model ----
        const mlPayload = {
          cosine: baseScore,
          sbert: baseScore,
          hard_skills: skillOverlap.length,
          soft_skills: softSkills.length,
          experience: jobInfo.yearsOfExperience || 0
        };

        let mlScore = baseScore;
        try {
          const mlResp = await fetch("http://127.0.0.1:8000/api/ml/predict/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mlPayload)
          });
          if (mlResp.ok) {
            const mlData = await mlResp.json();
            if (typeof mlData.ml_score === "number") {
              mlScore = mlData.ml_score;
            }
          }
        } catch (err) {
          console.error("ML backend error (SBERT mode):", err);
          // fallback: keep mlScore = baseScore
        }

        const finalScore = 0.5 * mlScore + 0.5 * baseScore;

        rows.push({
          id:    c.id,
          name:  c.name || "Unnamed",
          email: c.email || "",
          score: finalScore,
          rawScore: baseScore,
          tokenCount: tokensActive.length,
          termWeights: [],                // no TF-IDF weights in SBERT mode
          jdTopTerms: [],
          resumeTerms: new Set(tokensActive),
          skillOverlap,

            // Skill Gap fields:
            jdHardSkills,
            jdSoftSkills,
            missingHardSkills,
            missingSoftSkills,

          // FR2.2 entities:
          softSkills,
          education:      eduInfo.education,
          certifications: eduInfo.certifications,
          jobTitles:      jobInfo.jobTitles,
          yearsOfExperience: jobInfo.yearsOfExperience
        });
      }

      rows.sort((a,b)=>b.score-a.score);

      fairnessInfo = tfFairness && {
        ...tfFairness,
        modeUsed: fair ? "SBERT + anonymized tokens" : "SBERT + raw tokens"
      };

    } else {
      // TF-IDF mode (classic)
      const jdTokensActive     = fair ? jdTokensAnon : jdTokensBase;
      const resumeTokensActive = fair ? resumeTokensAnon : resumeTokensBase;

      const { scores, vocab, idf, vJD } =
        computeTfIdfScores(jdTokensActive, resumeTokensActive);

      const jdWeights  = vocab.map((t,i)=>({ term:t, weight:vJD[i] }))
                              .sort((a,b)=>b.weight-a.weight);
      const jdTopTerms = jdWeights.filter(x=>x.weight>0)
                                  .slice(0,30)
                                  .map(x=>x.term);

      rows = [];
      for (let i = 0; i < candidates.length; i++) {
        const c         = candidates[i];
        const tokenList = resumeTokensActive[i];
        const vR        = scores[i].vR;
        const baseScore = scores[i].score;
        const weights   = vocab.map((t,j)=>({ term:t, weight:vR[j] }))
                               .filter(x=>x.weight>0)
                               .sort((a,b)=>b.weight-a.weight);

        const softSkills  = extractSoftSkills(c.resumeText);
        const eduInfo     = extractEducationCerts(c.resumeText);
        const jobInfo     = extractJobInfo(c.resumeText);
        const skillOverlap= extractSkills(c.resumeText);

                // --- Skill Gap Analyzer (TF-IDF mode) ---
                const missingHardSkills = jdHardSkills.filter(s => !skillOverlap.includes(s));
                const missingSoftSkills = jdSoftSkills.filter(s => !(softSkills || []).includes(s));
        

        // ---- FR4.1: Call backend XGBoost model ----
        const mlPayload = {
          cosine: baseScore,
          sbert: 0,
          hard_skills: skillOverlap.length,
          soft_skills: softSkills.length,
          experience: jobInfo.yearsOfExperience || 0
        };

        let mlScore = baseScore;
        try {
          const mlResp = await fetch("http://127.0.0.1:8000/api/ml/predict/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mlPayload)
          });
          if (mlResp.ok) {
            const mlData = await mlResp.json();
            if (typeof mlData.ml_score === "number") {
              mlScore = mlData.ml_score;
            }
          }
        } catch (err) {
          console.error("ML backend error (TF-IDF mode):", err);
          // fallback: keep mlScore = baseScore
        }

        const finalScore = 0.5 * mlScore + 0.5 * baseScore;

        rows.push({
          id:    c.id,
          name:  c.name || "Unnamed",
          email: c.email || "",
          score: finalScore,
          rawScore: baseScore,      
          tokenCount: tokenList.length,
          termWeights: weights,
          jdTopTerms,
          resumeTerms: new Set(tokenList),
          skillOverlap,

           // Skill Gap fields:
           jdHardSkills,
           jdSoftSkills,
           missingHardSkills,
           missingSoftSkills,

          // FR2.2 entities:
          softSkills,
          education:      eduInfo.education,
          certifications: eduInfo.certifications,
          jobTitles:      jobInfo.jobTitles,
          yearsOfExperience: jobInfo.yearsOfExperience
        });
      }

      rows.sort((a,b)=>b.score-a.score);

      fairnessInfo = tfFairness && {
        ...tfFairness,
        modeUsed: fair ? "TF-IDF + anonymized tokens" : "TF-IDF + raw tokens"
      };
    }

    // --- 4. Render + fairness summary + audit log ---
    lastResults = rows;
    renderResults(rows);
    updateFairnessSummary(fairnessInfo || null);

    

    const topForLog = rows.slice(0,3).map(r => ({
      name: r.name,
      score: r.score
    }));
    appendAuditEntry({
      ts: Date.now(),
      numCandidates: candidates.length,
      jdLen: jdRaw.length,
      stop,
      fair,
      useSBERT,
      fairness: fairnessInfo || {},
      top: topForLog
    });
    // After ranking finishes, log analytics and refresh dashboard
  try {
    // Only count a new "job" if the JD text actually changed
    if (jdSignature && jdSignature !== lastJDSignature) {
      await logAnalyticsEvent("job");
      lastJDSignature = jdSignature;
      localStorage.setItem(LS_JD_SIG, jdSignature);
    }

    // Always count a ranking run
    await logAnalyticsEvent("ranking");

    // Refresh the Recruiter Analytics dashboard
    fetchAnalytics();
  } catch (e) {
    console.warn("Failed to update analytics after ranking:", e);
  }
    

  } catch (err) {
    console.error(err);
    alert("Ranking failed. See console for details.");
  }
}

// ----- CSV Export -----
function exportCsv(){
  if (!lastResults.length){ alert("No results to export. Rank candidates first."); return; }
  const header = ["Rank","Name","Email","Score(0-1)","TokenCount","OverlapSkills"];
  const lines = [header.join(",")];
  lastResults.forEach((r, i)=>{
    const row = [i+1, `"${r.name}"`, `"${r.email}"`, r.score.toFixed(6), r.tokenCount, `"${r.skillOverlap.join(" | ")}"`];
    lines.push(row.join(","));
  });
  const blob = new Blob([lines.join("\n")], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ranked_candidates.csv";
  a.click();
  URL.revokeObjectURL(url);
  logAnalyticsEvent("export");
  fetchAnalytics();
}

// ----- Sample Data -----
const SAMPLE_JD = `We are hiring a Machine Learning Engineer to build NLP pipelines and deploy services.
Responsibilities include: developing with Python, scikit-learn, and XGBoost; creating
Sentence-BERT based embeddings; building REST APIs with Django; data processing with Pandas/NumPy;
and deploying with Docker/AWS. Nice to have: Streamlit dashboards.`;

const SAMPLE_RESUMES = [
  {
    name:"Alex Johnson", email:"alex@sample.com",
    text:`Machine Learning Engineer with 3+ years experience. Built NLP with SpaCy and Sentence-BERT,
    training XGBoost and scikit-learn models. Strong Python, Pandas, NumPy. Created REST APIs with Django,
    deployed on AWS with Docker. Built recruiter dashboard using Streamlit.`
  },
  {
    name:"Priya Patel", email:"priya@sample.com",
    text:`Software Engineer focusing on backend services with Java and Spring. Designed REST APIs,
    PostgreSQL schema design, Docker and Kubernetes deployments. Some exposure to Python for data scripts.`
  },
  {
    name:"Marco Rossi", email:"marco@sample.com",
    text:`Data Scientist with emphasis on time series. Python, scikit-learn, TensorFlow. Built ETL pipelines,
    trained models, visualized insights. Familiar with NLP basics and Gensim.`
  }
];

// ----- Event wiring -----
function addCandidate({name,email,text}) {
    if (!text || !text.trim()) {
      alert("Resume text is required.");
      return;
    }
  
    const cand = {
      id: crypto.randomUUID(),
      name: name || "Unnamed",
      email: email || "",
      resumeText: text
    };
  
    console.log("✅ Adding candidate:", cand);
  
    candidates.push(cand);
    renderCandidateList();
  
    // Optional: save to localStorage
    try { localStorage.setItem("ai_candidates_v1", JSON.stringify(candidates)); } catch {}
  
    // Reset form
    document.querySelector("#candName").value = "";
    document.querySelector("#candEmail").value = "";
    document.querySelector("#candResume").value = "";
  }

  // ----- FR4.3: Retrain ML model using lastResults -----
async function retrainModel(){
  if (!lastResults.length){
    alert("Run ranking at least once before retraining the model.");
    return;
  }

  // Build training_data payload expected by backend
  const trainingData = lastResults.map(r => ({
    cosine_similarity: r.rawScore || r.score || 0,           // base similarity
    sbert_similarity:  0,                                    // we keep 0 for TF-IDF; can extend later
    hard_skill_matches: r.skillOverlap ? r.skillOverlap.length : 0,
    soft_skill_matches: r.softSkills ? r.softSkills.length : 0,
    years_experience:  r.yearsOfExperience || 0,
    label:             r.score || 0                          // final ML+similarity score as target
  }));

  const payload = { training_data: trainingData };

  try {
    const headers = { "Content-Type": "application/json" };

    // If you have JWT auth in Auth helper, attach token
    const token =
      (typeof Auth !== "undefined" && Auth.getAccessToken && Auth.getAccessToken()) ||
      (typeof Auth !== "undefined" && Auth.getToken && Auth.getToken());

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const resp = await fetch("http://127.0.0.1:8000/api/ml/retrain/", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("Retrain error:", data);
      alert("Retrain failed: " + (data.error || resp.status));
      return;
    }

    console.log("Retrain success:", data);
    alert("Model retrained successfully.");

  } catch (err) {
    console.error("Retrain request error:", err);
    alert("Could not reach retrain API. Check backend and console.");
  }
}

// ----- Recruiter Analytics Dashboard -----

// ----- Recruiter Analytics Dashboard -----
async function fetchAnalytics() {
  const session = typeof Auth !== "undefined" ? Auth.getSession() : null;
  const email = session?.email || null;

  // Build URL with ?email=...
  const url = email
    ? `http://127.0.0.1:8000/api/analytics/overview/?email=${encodeURIComponent(email)}`
    : "http://127.0.0.1:8000/api/analytics/overview/";

  try {
    const resp = await fetch(url, { method: "GET" });

    if (!resp.ok) {
      console.error("Failed to fetch analytics:", await resp.text());
      return;
    }
    const data = await resp.json();
    updateAnalyticsUI(data);
  } catch (err) {
    console.error("Analytics error:", err);
  }
}


// ----- Frontend → backend analytics logging -----
// ----- Frontend → backend analytics logging (per user) -----
async function logAnalyticsEvent(eventType) {
  const session = typeof Auth !== "undefined" ? Auth.getSession() : null;
  const email = session?.email || null;

  try {
    await fetch("http://127.0.0.1:8000/api/analytics/log-event/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: eventType, email }),
    });
  } catch (err) {
    console.warn("Analytics log failed:", err);
  }
}



function updateAnalyticsUI(data) {
  if (!data || !data.totals) return;

  const totals = data.totals;
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("metricJobs", totals.jobs ?? 0);
  setText("metricRuns", totals.matching_runs ?? 0);
  setText("metricExports", totals.exports ?? 0);
  setText("metricLogins", totals.logins ?? 0);

  // Prepare time series chart data
  const merged = {};
  (data.jobs_by_day || []).forEach(d => {
    merged[d.date] = merged[d.date] || { jobs: 0, runs: 0 };
    merged[d.date].jobs = d.count;
  });
  (data.runs_by_day || []).forEach(d => {
    merged[d.date] = merged[d.date] || { jobs: 0, runs: 0 };
    merged[d.date].runs = d.count;
  });

  const labels = Object.keys(merged).sort();
  const jobsSeries = labels.map(date => merged[date].jobs);
  const runsSeries = labels.map(date => merged[date].runs);

  const canvas = document.getElementById("analyticsChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (analyticsChart) {
    analyticsChart.destroy();
  }

  analyticsChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Jobs created",
          data: jobsSeries,
          tension: 0.3,
        },
        {
          label: "Ranking runs",
          data: runsSeries,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
      },
      scales: {
        x: {
          title: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });
}



document.addEventListener("DOMContentLoaded", ()=>{
  // Restore JD
  const savedJD = loadJSON(LS_JD, "");
  if (savedJD) $("#jdInput").value = savedJD;

  // Restore settings
  const s = loadJSON(LS_SETTINGS, null);
  if (s){
    if ($("#stopwordsToggle")) $("#stopwordsToggle").checked = !!s.stopwords;
    if ($("#fairToggle")) $("#fairToggle").checked = !!s.fair;
  }

  const retrainBtn = $("#retrainBtn");
  if (retrainBtn) {
    retrainBtn.addEventListener("click", retrainModel);
  }


  // Restore candidates
  candidates = loadJSON(LS_CANDIDATES, []);
  renderCandidateList();

  $("#loadSampleJd").addEventListener("click", ()=> $("#jdInput").value = SAMPLE_JD);
  $("#rankBtn").addEventListener("click", rank);
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#resetBtn").addEventListener("click", ()=>{
    $("#jdInput").value = "";
    candidates = [];
    lastResults = [];
    renderCandidateList();
    localStorage.removeItem(LS_JD);
    localStorage.removeItem(LS_CANDIDATES);
    $("#results").innerHTML = "";
  });

  updateFairnessSummary(null);               // initialize fairness box
  $("#viewAuditBtn").addEventListener("click", showAuditLog);

  // --- Recruiter Analytics wiring ---
  const refreshAnalyticsBtn = document.getElementById("refreshAnalyticsBtn");
  if (refreshAnalyticsBtn) {
    refreshAnalyticsBtn.addEventListener("click", fetchAnalytics);
  }
  fetchAnalytics();

  $("#addCandidateBtn").addEventListener("click", ()=>{
    addCandidate({
      name: $("#candName").value.trim(),
      email: $("#candEmail").value.trim(),
      text: $("#candResume").value
    });
  });

  $("#loadSampleCandidates").addEventListener("click", ()=>{
    SAMPLE_RESUMES.forEach(r=>addCandidate({ name:r.name, email:r.email, text:r.text }));
  });

  // === Resume Editor modal: save handler (3B) ===
  const editorForm  = document.querySelector("#editorForm");
  const editorModal = document.querySelector("#editorModal");

  if (editorForm) {
    editorForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      const id  = editorModal.dataset.id;
      const idx = candidates.findIndex(x=>x.id === id);
      if (idx === -1) return;

      candidates[idx].name       = (document.querySelector("#editorName").value || "").trim();
      candidates[idx].email      = (document.querySelector("#editorEmail").value || "").trim();
      candidates[idx].resumeText = document.querySelector("#editorText").value || "";

      try { localStorage.setItem(LS_CANDIDATES, JSON.stringify(candidates)); } catch {}
      renderCandidateList();
      editorModal.close();
    });
  }

  // Persist JD text
  $("#jdInput").addEventListener("input", ()=>{
    saveJSON(LS_JD, $("#jdInput").value);
  });
  
  // Persist settings (stopwords + PII toggle)
  function saveSettings(){
    saveJSON(LS_SETTINGS, {
      stopwords: $("#stopwordsToggle").checked,
      fair: $("#fairToggle").checked
    });
  }
  $("#stopwordsToggle").addEventListener("change", saveSettings);
  $("#fairToggle").addEventListener("change", saveSettings);
  
  $("#resumeFile").addEventListener("change", async (e)=>{
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files){
      try {
        const text = await extractTextFromFile(f);
        addCandidate({ name: f.name.replace(/\.[^/.]+$/,""), email:"", text });
      } catch (err) {
        console.error(err);
        alert(err.message || `Could not read ${f.name}`);
      }
    }
  });

  // === Drag & Drop + Paste into drop zone (3C) ===
  const drop = document.querySelector("#dropZone");
  if (drop) {
    const hoverOn  = e => { e.preventDefault(); drop.classList.add("hover"); };
    const hoverOff = () => drop.classList.remove("hover");

    ["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, hoverOn));
    ["dragleave","dragend"].forEach(ev => drop.addEventListener(ev, hoverOff));

    drop.addEventListener("drop", async (e)=>{
      e.preventDefault(); hoverOff();
      const dt = e.dataTransfer;
      const items = Array.from(dt.items || []);
      const files = [];

      for (const it of items) {
        if (it.kind === "file") files.push(it.getAsFile());
      }

      if (files.length){
        let added = 0, failed = 0;
        for (const f of files){
          try {
            const text = await extractTextFromFile(f);
            addCandidate({ name: f.name.replace(/\.[^/.]+$/,""), email:"", text });
            added++;
          } catch(err){ console.error(err); failed++; }
        }
        const s = document.querySelector("#uploadStatus");
        if (s) s.textContent = `Added ${added} file(s)` + (failed?`, ${failed} failed`:"");
      } else {
        // Plain text drop
        const text = dt.getData("text/plain");
        if (text && text.trim()){
          addCandidate({ name:"Pasted Candidate", email:"", text });
        }
        
      }
      
    });

    // Allow Cmd/Ctrl+V paste directly into the drop zone
    drop.addEventListener("paste", (e)=>{
      const text = (e.clipboardData || window.clipboardData).getData("text");
      if (text && text.trim()){
        e.preventDefault();
        addCandidate({ name:"Pasted Candidate", email:"", text });
      }
    });
      // ----- FR7.3: LinkedIn external job search wiring -----
  const linkedinBtn = document.getElementById("linkedin-search-btn");
  if (linkedinBtn) {
    linkedinBtn.addEventListener("click", onLinkedInSearchClick);
  }

  }

});
