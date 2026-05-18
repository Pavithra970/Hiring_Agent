from typing import Dict, Any, List
import numpy as np

from .schemas import ScoreBreakdown


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _norm_map(items: List[str]) -> dict:
    return {item.strip().lower(): item for item in items if item and item.strip()}


def compute_scores(
    resume_embedding,
    jd_embedding,
    extracted_data: Dict[str, Any],
    jd_requirements: Dict[str, Any],
):
    resume_vec = np.array(resume_embedding, dtype=float)
    jd_vec = np.array(jd_embedding, dtype=float)

    denom = (np.linalg.norm(resume_vec) * np.linalg.norm(jd_vec))
    semantic = float(np.dot(resume_vec, jd_vec) / denom) if denom else 0.0
    semantic_score = _clamp(((semantic + 1) / 2) * 100)

    candidate_skills = extracted_data.get("skills", [])
    required_skills = jd_requirements.get("required_skills", [])

    cand_map = _norm_map(candidate_skills)
    req_map = _norm_map(required_skills)

    matched = []
    missing = []

    for req_key, req_original in req_map.items():
        if req_key in cand_map:
            matched.append(cand_map[req_key])
        else:
            missing.append(req_original)

    skill_score = _clamp((len(matched) / len(required_skills)) * 100) if required_skills else 0.0

    candidate_years = float(extracted_data.get("experience_years", 0.0) or 0.0)
    required_years = float(jd_requirements.get("required_years", 0.0) or 0.0)

    if required_years > 0:
        experience_score = _clamp((candidate_years / required_years) * 100) if candidate_years > 0 else 0.0
    else:
        experience_score = 0.0

    candidate_education = " ".join(extracted_data.get("education", [])).lower()
    required_education = [x.lower() for x in jd_requirements.get("education_required", [])]

    if required_education:
        education_score = 100.0 if any(req in candidate_education for req in required_education) else 0.0
    else:
        education_score = 0.0

    certifications = extracted_data.get("certifications", [])
    certification_score = 100.0 if certifications else 0.0

    components = [
        (semantic_score, 0.45),
        (skill_score, 0.35 if required_skills else 0.0),
        (experience_score, 0.20 if required_years > 0 else 0.0),
        (education_score, 0.10 if required_education else 0.0),
    ]

    total_weight = sum(weight for _, weight in components if weight > 0)
    overall_score = (
        sum(score * weight for score, weight in components if weight > 0) / total_weight
        if total_weight > 0
        else semantic_score
    )

    scores = ScoreBreakdown(
        semantic_score=round(semantic_score, 2),
        skill_score=round(skill_score, 2),
        experience_score=round(experience_score, 2),
        education_score=round(education_score, 2),
        certification_score=round(certification_score, 2),
        overall_score=round(overall_score, 2),
    )

    strongest = ", ".join(matched[:5]) if matched else "no strong skill matches"
    weak = ", ".join(missing[:5]) if missing else "no major gaps"

    summary = f"Strongest matches: {strongest}. Key gaps: {weak}."

    justification = (
        f"Ranked because skill overlap is {scores.skill_score:.1f}%, "
        f"experience fit is {scores.experience_score:.1f}%, and the resume aligns "
        f"with the JD on {strongest}. Main gaps: {weak}."
    )

    highlights = [
        f"Matched skills: {', '.join(matched[:10])}" if matched else "Matched skills: none",
        f"Missing skills: {', '.join(missing[:10])}" if missing else "Missing skills: none",
        f"Overall score: {scores.overall_score}%",
    ]

    return {
        "scores": scores,
        "matched_skills": matched,
        "missing_skills": missing,
        "summary": summary,
        "match_justification": justification,
        "highlights": highlights,
    }