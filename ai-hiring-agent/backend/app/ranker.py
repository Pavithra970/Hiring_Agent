from typing import Dict, Any, List
import numpy as np

from .schemas import ScoreBreakdown

# Threshold: skills whose embedding cosine similarity >= this are considered matched.
# 0.82 catches clear synonyms (ML ↔ Machine Learning, JS ↔ JavaScript, NLP ↔ Natural Language Processing)
# without false-positives (Python ≠ PyTorch).
SKILL_SIM_THRESHOLD = 0.82


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _embed_skills(skills: List[str], embedder) -> np.ndarray:
    """Return (N, D) float32 array of L2-normalised skill embeddings."""
    if not skills:
        return np.zeros((0, 384), dtype=np.float32)
    vecs = embedder.encode(skills, normalize_embeddings=True, show_progress_bar=False)
    return np.array(vecs, dtype=np.float32)


def _semantic_skill_match(
    candidate_skills: List[str],
    required_skills: List[str],
    embedder,
) -> tuple[List[str], List[str]]:
    """
    For each required skill find the best-matching candidate skill by cosine
    similarity.  Because both embedding sets are L2-normalised, cosine sim ==
    dot product, so we can do a single matrix multiply.

    Returns (matched_required, missing_required) using the *required* skill
    label so the UI always shows the JD wording.
    """
    if not required_skills:
        return [], []

    if not candidate_skills:
        return [], list(required_skills)

    req_vecs  = _embed_skills(required_skills, embedder)   # (R, D)
    cand_vecs = _embed_skills(candidate_skills, embedder)  # (C, D)

    # (R, C) similarity matrix
    sim_matrix = req_vecs @ cand_vecs.T

    matched: List[str] = []
    missing: List[str] = []

    for r_idx, req_skill in enumerate(required_skills):
        best_sim = float(sim_matrix[r_idx].max())
        if best_sim >= SKILL_SIM_THRESHOLD:
            matched.append(req_skill)
        else:
            missing.append(req_skill)

    return matched, missing


def compute_scores(
    resume_embedding,
    jd_embedding,
    extracted_data: Dict[str, Any],
    jd_requirements: Dict[str, Any],
    embedder=None,                    # ← injected from main.py
):
    # ── Semantic (whole-document) score ───────────────────────────────────────
    resume_vec = np.array(resume_embedding, dtype=float)
    jd_vec     = np.array(jd_embedding, dtype=float)

    denom = np.linalg.norm(resume_vec) * np.linalg.norm(jd_vec)
    semantic = float(np.dot(resume_vec, jd_vec) / denom) if denom else 0.0
    semantic_score = _clamp(((semantic + 1) / 2) * 100)

    # ── Skill matching ────────────────────────────────────────────────────────
    candidate_skills = extracted_data.get("skills", [])
    required_skills  = jd_requirements.get("required_skills", [])

    if embedder is not None and required_skills and candidate_skills:
        # Semantic matching: catches ML↔Machine Learning, JS↔JavaScript, etc.
        matched, missing = _semantic_skill_match(
            candidate_skills, required_skills, embedder
        )
    else:
        # Fallback: exact lowercase match (original behaviour)
        cand_lower = {s.strip().lower(): s for s in candidate_skills}
        matched, missing = [], []
        for req in required_skills:
            if req.strip().lower() in cand_lower:
                matched.append(req)
            else:
                missing.append(req)

    skill_score = _clamp((len(matched) / len(required_skills)) * 100) if required_skills else 0.0

    # ── Experience score ──────────────────────────────────────────────────────
    candidate_years = float(extracted_data.get("experience_years", 0.0) or 0.0)
    required_years  = float(jd_requirements.get("required_years",  0.0) or 0.0)

    if required_years > 0:
        experience_score = _clamp((candidate_years / required_years) * 100) if candidate_years > 0 else 0.0
    else:
        experience_score = 0.0

    # ── Education score ───────────────────────────────────────────────────────
    candidate_education = " ".join(extracted_data.get("education", [])).lower()
    required_education  = [x.lower() for x in jd_requirements.get("education_required", [])]

    if required_education:
        education_score = 100.0 if any(req in candidate_education for req in required_education) else 0.0
    else:
        education_score = 0.0

    # ── Certification score ───────────────────────────────────────────────────
    certifications     = extracted_data.get("certifications", [])
    certification_score = 100.0 if certifications else 0.0

    # ── Weighted overall ──────────────────────────────────────────────────────
    components = [
        (semantic_score,    0.45),
        (skill_score,       0.35 if required_skills  else 0.0),
        (experience_score,  0.20 if required_years   > 0 else 0.0),
        (education_score,   0.10 if required_education else 0.0),
    ]

    total_weight  = sum(w for _, w in components if w > 0)
    overall_score = (
        sum(s * w for s, w in components if w > 0) / total_weight
        if total_weight > 0 else semantic_score
    )

    scores = ScoreBreakdown(
        semantic_score=round(semantic_score,    2),
        skill_score=round(skill_score,          2),
        experience_score=round(experience_score,2),
        education_score=round(education_score,  2),
        certification_score=round(certification_score, 2),
        overall_score=round(overall_score,      2),
    )

    # ── Human-readable output ─────────────────────────────────────────────────
    strongest = ", ".join(matched[:5]) if matched else "no strong skill matches"
    weak      = ", ".join(missing[:5]) if missing else "no major gaps"

    summary = f"Strongest matches: {strongest}. Key gaps: {weak}."

    justification = (
        f"Ranked because skill overlap is {scores.skill_score:.1f}% "
        f"(semantic matching), experience fit is {scores.experience_score:.1f}%, "
        f"and the resume aligns with the JD on {strongest}. Main gaps: {weak}."
    )

    highlights = [
        f"Matched skills: {', '.join(matched[:10])}" if matched else "Matched skills: none",
        f"Missing skills: {', '.join(missing[:10])}" if missing else "Missing skills: none",
        f"Overall score: {scores.overall_score}%",
    ]

    return {
        "scores":            scores,
        "matched_skills":    matched,
        "missing_skills":    missing,
        "summary":           summary,
        "match_justification": justification,
        "highlights":        highlights,
    }
