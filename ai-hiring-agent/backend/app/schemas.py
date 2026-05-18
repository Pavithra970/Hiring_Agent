from pydantic import BaseModel
from typing import List, Optional


class ResumeExtractedData(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None

    skills: List[str] = []
    experience_years: float = 0.0
    companies: List[str] = []
    education: List[str] = []
    certifications: List[str] = []
    projects: List[str] = []


class JDRequirements(BaseModel):
    title: Optional[str] = None
    required_skills: List[str] = []
    required_years: float = 0.0
    education_required: List[str] = []


class ScoreBreakdown(BaseModel):
    semantic_score: float
    skill_score: float
    experience_score: float
    education_score: float
    certification_score: float
    overall_score: float


class CandidateResult(BaseModel):
    rank: int = 0
    filename: str
    extracted_data: ResumeExtractedData
    scores: ScoreBreakdown
    matched_skills: List[str]
    missing_skills: List[str]
    summary: str
    match_justification: str = ""
    highlights: List[str]


class AnalysisResponse(BaseModel):
    jd_requirements: JDRequirements
    total_candidates: int
    top_candidates: List[CandidateResult]
    all_candidates: List[CandidateResult]