from pathlib import Path
from typing import List, Annotated

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sentence_transformers import SentenceTransformer

from .schemas import (
    AnalysisResponse,
    CandidateResult,
    ResumeExtractedData,
    JDRequirements,
)
from .parser import extract_text_from_upload
from .extractor import extract_resume_data, extract_jd_requirements
from .ranker import compute_scores

app = FastAPI(title="AI Hiring Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


@app.get("/")
def health():
    return {"status": "running"}


@app.get("/ui", response_class=HTMLResponse)
def ui():
    html_path = BASE_DIR / "templates" / "index.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    jd_text: Annotated[str, Form(...)],
    files: Annotated[List[UploadFile], File(...)],
    top_n: Annotated[int, Form()] = 5,
):
    jd_requirements_dict = extract_jd_requirements(jd_text)
    jd_embedding = embedder.encode([jd_text], normalize_embeddings=True)[0]

    results: List[CandidateResult] = []

    for file in files:
        file_bytes = await file.read()
        resume_text = extract_text_from_upload(file.filename, file_bytes)

        extracted_dict = extract_resume_data(resume_text)
        resume_embedding = embedder.encode([resume_text], normalize_embeddings=True)[0]

        ranked = compute_scores(
            resume_embedding=resume_embedding,
            jd_embedding=jd_embedding,
            extracted_data=extracted_dict,
            jd_requirements=jd_requirements_dict,
        )

        result = CandidateResult(
            rank=0,
            filename=file.filename,
            extracted_data=ResumeExtractedData(**extracted_dict),
            scores=ranked["scores"],
            matched_skills=ranked["matched_skills"],
            missing_skills=ranked["missing_skills"],
            summary=ranked["summary"],
            match_justification=ranked["match_justification"],
            highlights=ranked["highlights"],
        )
        results.append(result)

    results.sort(key=lambda x: x.scores.overall_score, reverse=True)

    for idx, candidate in enumerate(results, start=1):
        candidate.rank = idx

    return AnalysisResponse(
        jd_requirements=JDRequirements(**jd_requirements_dict),
        total_candidates=len(results),
        top_candidates=results[: max(1, top_n)],
        all_candidates=results,
    )