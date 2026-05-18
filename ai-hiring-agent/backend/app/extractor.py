import re
from typing import Dict, Any, List

from .models.gliner_loader import gliner_model


SECTION_ALIASES = {
    "skills": ["skills", "technical skills", "core competencies", "skill set", "tech stack", "tools"],
    "experience": ["experience", "work experience", "professional experience", "employment history", "internships"],
    "education": ["education", "academic background", "qualification", "academics"],
    "certifications": ["certifications", "certificates", "licenses", "credential", "credentials"],
    "projects": ["projects", "project work", "academic projects", "personal projects"],
    "summary": ["summary", "profile", "objective", "about", "about me"],
}


IGNORE_EXACT = {
    "skills", "skill", "projects", "project", "experience", "education",
    "certifications", "certification", "summary", "objective", "profile",
    "technical skills", "core competencies", "work experience",
    "professional experience", "employment history"
}


def normalize_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def clean_entity(value: str) -> str:
    value = value.strip()
    value = value.strip("•-–—|/ \t\r\n")
    value = re.sub(r"\s+", " ", value)
    return value


def unique_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        cleaned = clean_entity(item)
        key = cleaned.lower()
        if cleaned and key not in seen:
            seen.add(key)
            out.append(cleaned)
    return out


def is_noise(value: str) -> bool:
    low = clean_entity(value).lower()

    if not low:
        return True

    if low in IGNORE_EXACT:
        return True

    if re.search(r"\bminimum\b.*\byears?\b", low):
        return True

    if re.search(r"\b\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b", low):
        return True

    if low in {"resume", "cv", "curriculum vitae"}:
        return True

    if len(low) <= 1:
        return True

    if re.fullmatch(r"[\W_]+", low):
        return True

    return False


def canonical_section_name(line: str) -> str | None:
    low = clean_entity(line).lower().rstrip(":")
    for canonical, aliases in SECTION_ALIASES.items():
        if low in aliases:
            return canonical
    return None


def is_heading(line: str) -> bool:
    low = clean_entity(line).lower().rstrip(":")
    if canonical_section_name(low):
        return True

    # common resume headings not explicitly mapped
    common = {
        "skills", "experience", "education", "projects", "certifications",
        "summary", "objective", "profile", "interests", "achievements"
    }
    if low in common:
        return True

    return False


def split_sections(text: str) -> Dict[str, str]:
    lines = [line.rstrip() for line in normalize_text(text).splitlines()]
    sections: Dict[str, List[str]] = {"preamble": []}
    current = "preamble"

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        section_name = canonical_section_name(line)
        if is_heading(line):
            current = section_name or clean_entity(line).lower().rstrip(":")
            sections.setdefault(current, [])
            continue

        sections.setdefault(current, []).append(line)

    return {k: "\n".join(v).strip() for k, v in sections.items() if v}


def extract_entities(text: str, labels: List[str], threshold: float = 0.35) -> List[str]:
    text = normalize_text(text)
    if not text:
        return []

    entities = gliner_model.predict_entities(text, labels, threshold=threshold)

    values = []
    for ent in entities:
        value = clean_entity(ent.get("text", ""))
        if not value:
            continue
        if is_noise(value):
            continue
        values.append(value)

    return unique_keep_order(values)


def extract_email(text: str) -> str | None:
    match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", text)
    return match.group(0) if match else None


def extract_phone(text: str) -> str | None:
    patterns = [
        r"(\+\d{1,3}[-\s]?)?\d{10}",
        r"(\+\d{1,3}[-\s]?)?\d{3,5}[-\s]\d{3,5}[-\s]\d{3,5}",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def extract_linkedin(text: str) -> str | None:
    match = re.search(
        r"(https?://)?(www\.)?linkedin\.com/in/[A-Za-z0-9\-_/%]+",
        text,
        flags=re.IGNORECASE,
    )
    return match.group(0) if match else None


def extract_github(text: str) -> str | None:
    match = re.search(
        r"(https?://)?(www\.)?github\.com/[A-Za-z0-9\-_/%]+",
        text,
        flags=re.IGNORECASE,
    )
    return match.group(0) if match else None


def extract_years(text: str) -> float:
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s+years?\s+(?:of\s+)?experience",
        r"experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)",
        r"(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except Exception:
                pass
    return 0.0


def find_name(text: str) -> str | None:
    sections = split_sections(text)
    preamble = sections.get("preamble", "")
    lines = [line.strip() for line in preamble.splitlines() if line.strip()]

    for line in lines[:8]:
        low = line.lower()
        if "@" in low or "http" in low:
            continue
        if any(word in low for word in ["linkedin", "github", "phone", "email"]):
            continue
        if len(line.split()) <= 4 and not re.search(r"\d", line):
            return clean_entity(line)

    # fallback
    full_lines = [line.strip() for line in normalize_text(text).splitlines() if line.strip()]
    for line in full_lines[:5]:
        if "@" in line or "http" in line:
            continue
        if len(line.split()) <= 4 and not re.search(r"\d", line):
            return clean_entity(line)

    return None


def extract_resume_data(text: str) -> Dict[str, Any]:
    text = normalize_text(text)
    sections = split_sections(text)

    skills_text = sections.get("skills", "")
    experience_text = sections.get("experience", "")
    education_text = sections.get("education", "")
    cert_text = sections.get("certifications", "")
    projects_text = sections.get("projects", "")

    skill_labels = ["skill", "technology", "tool", "framework", "library", "language", "database", "cloud platform"]
    org_labels = ["organization", "company", "employer"]
    edu_labels = ["education", "degree", "university", "college", "school", "qualification"]
    cert_labels = ["certification", "certificate", "credential", "license"]
    project_labels = ["project", "application", "system", "product", "solution"]

    # Skills: prefer the skills section, then merge a filtered pass over the full text
    skills = extract_entities(skills_text or text, skill_labels, threshold=0.30)
    skills_extra = extract_entities(text, skill_labels, threshold=0.55)
    skills = unique_keep_order(skills + skills_extra)

    companies = extract_entities(experience_text or text, org_labels, threshold=0.35)
    education = extract_entities(education_text or text, edu_labels, threshold=0.35)
    certifications = extract_entities(cert_text or text, cert_labels, threshold=0.35)
    projects = extract_entities(projects_text or text, project_labels, threshold=0.35)

    return {
        "name": find_name(text),
        "email": extract_email(text),
        "phone": extract_phone(text),
        "location": None,
        "linkedin": extract_linkedin(text),
        "github": extract_github(text),
        "skills": skills,
        "experience_years": extract_years(experience_text or text),
        "companies": companies,
        "education": education,
        "certifications": certifications,
        "projects": projects,
    }


def extract_jd_requirements(jd_text: str) -> Dict[str, Any]:
    jd_text = normalize_text(jd_text)

    skill_labels = ["skill", "technology", "tool", "framework", "library", "language", "database", "cloud platform"]
    edu_labels = ["education", "degree", "university", "college", "school", "qualification"]

    required_skills = extract_entities(jd_text, skill_labels, threshold=0.30)
    required_skills = [s for s in required_skills if not is_noise(s)]

    education_required = extract_entities(jd_text, edu_labels, threshold=0.35)

    lines = [line.strip() for line in jd_text.splitlines() if line.strip()]
    title = lines[0][:120] if lines else "Job Description"

    return {
        "title": title,
        "required_skills": required_skills,
        "required_years": extract_years(jd_text),
        "education_required": education_required,
    }