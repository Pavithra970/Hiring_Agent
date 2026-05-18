import re
import numpy as np


def normalize_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def cosine_similarity(vec1, vec2):
    vec1 = np.array(vec1)
    vec2 = np.array(vec2)

    denom = np.linalg.norm(vec1) * np.linalg.norm(vec2)

    if denom == 0:
        return 0.0

    return float(np.dot(vec1, vec2) / denom)