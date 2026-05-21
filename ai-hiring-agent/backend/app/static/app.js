// ─── Global State ────────────────────────────────────────────────────────────
let APP_DATA = null;
let SELECTED_SHORTLIST_INDEX = 0;
let ACTIVE_SKILL_FILTERS = new Set();

// ─── Utilities ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safeArray(value) {
    return Array.isArray(value) ? value : (value ? [value] : []);
}

function setStatus(msg, isError = false) {
    const el = document.getElementById("statusText");
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? "#dc2626" : "#64748b";
    }
}

// Build the backend URL for a resume file
function fileUrl(sessionId, filename) {
    return `/file/${encodeURIComponent(sessionId)}/${encodeURIComponent(filename)}`;
}

// ─── Data Accessors ───────────────────────────────────────────────────────────
function getAllCandidates() {
    return APP_DATA?.all_candidates || [];
}

function getTopCandidates() {
    return APP_DATA?.top_candidates || [];
}

function getFilteredCandidates() {
    const all = getAllCandidates();
    const search = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
    const minScore = Number(document.getElementById("scoreFilter")?.value || 0);

    return all.filter(candidate => {
        const data = candidate.extracted_data || {};
        const score = Number(candidate.scores?.overall_score || 0);

        if (score < minScore) return false;

        if (ACTIVE_SKILL_FILTERS.size > 0) {
            const skills = safeArray(data.skills).map(s => s.toLowerCase());
            const hasAll = [...ACTIVE_SKILL_FILTERS].every(f => skills.includes(f));
            if (!hasAll) return false;
        }

        if (search) {
            const name = (data.name || "").toLowerCase();
            const skills = safeArray(data.skills).join(" ").toLowerCase();
            const companies = safeArray(data.companies).join(" ").toLowerCase();
            const filename = (candidate.filename || "").toLowerCase();
            if (
                !name.includes(search) &&
                !skills.includes(search) &&
                !companies.includes(search) &&
                !filename.includes(search)
            ) return false;
        }

        return true;
    });
}

function uniqueSkills(candidates) {
    const set = new Set();
    candidates.forEach(c => {
        safeArray(c.extracted_data?.skills).forEach(s => {
            if (s && s.trim()) set.add(s.trim());
        });
    });
    return [...set].sort();
}

// ─── Summary Stats ────────────────────────────────────────────────────────────
function computeSummaryStats(candidates) {
    const total = candidates.length;
    if (!total) return { total: 0, avgScore: 0, topScore: 0, skillCount: 0 };
    const scores = candidates.map(c => Number(c.scores?.overall_score || 0));
    const avgScore = scores.reduce((a, b) => a + b, 0) / total;
    const topScore = Math.max(...scores);
    const skillCount = uniqueSkills(candidates).length;
    return { total, avgScore, topScore, skillCount };
}

function buildSummaryCards(stats) {
    const el = document.getElementById("summaryCards");
    if (!el) return;
    el.innerHTML = `
        <div class="summary-card">
            <div class="label">Total Candidates</div>
            <div class="value">${stats.total}</div>
        </div>
        <div class="summary-card">
            <div class="label">Avg Match Score</div>
            <div class="value">${stats.avgScore.toFixed(1)}%</div>
        </div>
        <div class="summary-card">
            <div class="label">Top Score</div>
            <div class="value">${stats.topScore.toFixed(1)}%</div>
        </div>
        <div class="summary-card">
            <div class="label">Unique Skills Seen</div>
            <div class="value">${stats.skillCount}</div>
        </div>
    `;
}

// ─── Skill Filter Chips ───────────────────────────────────────────────────────
function buildSkillFilters(skills) {
    const el = document.getElementById("skillFilters");
    if (!el) return;
    el.innerHTML = skills.map(skill => {
        const active = ACTIVE_SKILL_FILTERS.has(skill.toLowerCase()) ? "active" : "";
        return `<span class="chip ${active}" data-skill="${escapeHtml(skill.toLowerCase())}">${escapeHtml(skill)}</span>`;
    }).join("");

    el.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const s = chip.getAttribute("data-skill");
            if (ACTIVE_SKILL_FILTERS.has(s)) {
                ACTIVE_SKILL_FILTERS.delete(s);
                chip.classList.remove("active");
            } else {
                ACTIVE_SKILL_FILTERS.add(s);
                chip.classList.add("active");
            }
            renderDashboard();
        });
    });
}

function resetFilters() {
    ACTIVE_SKILL_FILTERS.clear();
    const search = document.getElementById("searchInput");
    const score = document.getElementById("scoreFilter");
    const scoreVal = document.getElementById("scoreValue");
    if (search) search.value = "";
    if (score) score.value = 0;
    if (scoreVal) scoreVal.textContent = "0";
    renderDashboard();
}

// ─── Shortlist ────────────────────────────────────────────────────────────────
function renderTopCandidateCard(candidate, index) {
    const data = candidate.extracted_data || {};
    const score = Number(candidate.scores?.overall_score || 0);
    const matched = safeArray(candidate.matched_skills);
    const missing = safeArray(candidate.missing_skills);
    const isActive = index === SELECTED_SHORTLIST_INDEX ? "active" : "";

    return `
        <div class="shortlist-tab ${isActive}" data-shortlist-index="${index}">
            <div class="tab-top">
                <span class="tab-rank">#${candidate.rank || index + 1}</span>
                ${isActive ? `<span class="tab-selected">Selected</span>` : ""}
            </div>
            <div class="tab-name">${escapeHtml(data.name || "Unknown")}</div>
            <div class="tab-meta">${escapeHtml(candidate.filename || "")}</div>
            <div class="tab-score">${score.toFixed(1)}% Match</div>
            <div class="tab-counts">
                <span class="tab-count matched">${matched.length} matched</span>
                <span class="tab-count missing">${missing.length} missing</span>
            </div>
        </div>
    `;
}

function renderShortlistDetail(shortlist) {
    const el = document.getElementById("shortlistDetail");
    if (!el) return;
    if (!shortlist.length) { el.innerHTML = ""; return; }

    const candidate = shortlist[SELECTED_SHORTLIST_INDEX] || shortlist[0];
    const data = candidate.extracted_data || {};
    const score = Number(candidate.scores?.overall_score || 0);
    const matched = safeArray(candidate.matched_skills);
    const missing = safeArray(candidate.missing_skills);
    const sid = candidate.session_id || APP_DATA?.session_id || "";
    const vUrl = fileUrl(sid, candidate.filename);

    el.innerHTML = `
        <div class="shortlist-detail">
            <div class="detail-head">
                <div>
                    <h3 class="detail-title">${escapeHtml(data.name || "Unknown Candidate")}</h3>
                    <div class="detail-meta">
                        ${escapeHtml(candidate.filename || "")}<br/>
                        ${escapeHtml(data.email || "")} ${data.phone ? "• " + escapeHtml(data.phone) : ""}
                    </div>
                </div>
                <div class="detail-score">${score.toFixed(1)}% Match</div>
            </div>

            <div class="section-title">Matched Skills</div>
            <div class="chips">
                ${matched.length
                    ? matched.map(s => `<span class="skill-chip">${escapeHtml(s)}</span>`).join("")
                    : `<span style="color:#64748b;">None</span>`}
            </div>

            <div class="section-title">Missing Skills</div>
            <div class="chips">
                ${missing.length
                    ? missing.map(s => `<span class="skill-chip missing-chip">${escapeHtml(s)}</span>`).join("")
                    : `<span style="color:#64748b;">None</span>`}
            </div>

            <div class="section-title">Why this match</div>
            <div class="why-box"><p>${escapeHtml(candidate.match_justification || candidate.summary || "")}</p></div>

            <div class="detail-actions">
                <a class="mini-btn" href="${vUrl}" target="_blank" rel="noopener">View</a>
                <a class="mini-btn ghost-btn" href="${vUrl}" download="${escapeHtml(candidate.filename)}">Download</a>
            </div>
        </div>
    `;
}

// ─── Candidate Cards ──────────────────────────────────────────────────────────
function renderCandidateCard(candidate, index) {
    try {
        const data = candidate.extracted_data || {};
        const score = Number(candidate.scores?.overall_score || 0);
        const skill = Number(candidate.scores?.skill_score || 0);
        const exp   = Number(candidate.scores?.experience_score || 0);
        const edu   = Number(candidate.scores?.education_score || 0);

        const matched    = safeArray(candidate.matched_skills);
        const missing    = safeArray(candidate.missing_skills);
        const highlights = safeArray(candidate.highlights);
        const education  = safeArray(data.education);
        const projects   = safeArray(data.projects);
        const certs      = safeArray(data.certifications);
        const companies  = safeArray(data.companies);

        const sid  = candidate.session_id || APP_DATA?.session_id || "";
        const vUrl = fileUrl(sid, candidate.filename);

        return `
            <article class="candidate-card">
                <div class="candidate-head">
                    <div>
                        <div class="rank-badge">#${candidate.rank || (index + 1)}</div>
                        <h3 class="candidate-name">${escapeHtml(data.name || "Unknown Candidate")}</h3>
                        <div class="candidate-meta">
                            ${escapeHtml(candidate.filename || "")}<br/>
                            ${escapeHtml(data.email || "No email")}${data.phone ? " • " + escapeHtml(data.phone) : ""}
                        </div>
                    </div>
                    <div class="score-pill">${score.toFixed(1)}% Match</div>
                </div>

                <div class="progress-wrap">
                    <div class="progress-label">
                        <span>Overall match</span>
                        <span>${score.toFixed(1)}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${Math.max(0, Math.min(100, score))}%"></div>
                    </div>
                </div>

                <div class="section-title">Score Breakdown</div>

                <div class="progress-label"><span>Skills</span><span>${skill.toFixed(1)}%</span></div>
                <div class="progress-bar"><div class="progress-fill" style="width:${skill}%"></div></div>

                <div style="height:10px"></div>
                <div class="progress-label"><span>Experience</span><span>${exp.toFixed(1)}%</span></div>
                <div class="progress-bar"><div class="progress-fill" style="width:${exp}%"></div></div>

                <div style="height:10px"></div>
                <div class="progress-label"><span>Education</span><span>${edu.toFixed(1)}%</span></div>
                <div class="progress-bar"><div class="progress-fill" style="width:${edu}%"></div></div>

                <div class="section-title">Matched Skills</div>
                <div class="chips">
                    ${matched.length
                        ? matched.map(s => `<span class="skill-chip">${escapeHtml(s)}</span>`).join("")
                        : `<span style="color:#64748b;">No matched skills</span>`}
                </div>

                <div class="section-title">Missing Skills</div>
                <div class="chips">
                    ${missing.length
                        ? missing.map(s => `<span class="skill-chip missing-chip">${escapeHtml(s)}</span>`).join("")
                        : `<span style="color:#64748b;">No missing skills</span>`}
                </div>

                <div class="section-title">Why this match</div>
                <p>${escapeHtml(candidate.match_justification || candidate.summary || "")}</p>

                <div class="section-title">Quick Summary</div>
                <p>${escapeHtml(candidate.summary || "")}</p>

                <div class="section-title">Highlights</div>
                <ul class="highlight-list">
                    ${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}
                </ul>

                <div class="detail-actions">
                    <a class="mini-btn" href="${vUrl}" target="_blank" rel="noopener">View</a>
                    <a class="mini-btn ghost-btn" href="${vUrl}" download="${escapeHtml(candidate.filename)}">Download</a>
                </div>

                <details>
                    <summary>Show extracted resume details</summary>

                    <div class="section-title">Companies</div>
                    <div class="chips">
                        ${companies.length
                            ? companies.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("")
                            : `<span style="color:#64748b;">None</span>`}
                    </div>

                    <div class="section-title">Education</div>
                    <div class="chips">
                        ${education.length
                            ? education.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("")
                            : `<span style="color:#64748b;">None</span>`}
                    </div>

                    <div class="section-title">Projects</div>
                    <div class="chips">
                        ${projects.length
                            ? projects.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("")
                            : `<span style="color:#64748b;">None</span>`}
                    </div>

                    <div class="section-title">Certifications</div>
                    <div class="chips">
                        ${certs.length
                            ? certs.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("")
                            : `<span style="color:#64748b;">None</span>`}
                    </div>
                </details>
            </article>
        `;
    } catch (error) {
        console.error("Failed to render candidate card:", error, candidate);
        return `
            <article class="candidate-card">
                <p><strong>Unable to render candidate card.</strong></p>
                <p style="color:#64748b;">Please check the candidate data structure.</p>
            </article>
        `;
    }
}

function renderRankedCandidates(candidates) {
    const list = document.getElementById("candidateList");
    if (!list) return;
    list.innerHTML = "";

    if (!candidates.length) {
        list.innerHTML = `<div class="candidate-empty">No ranked candidates to show.</div>`;
        return;
    }

    const grid = document.createElement("div");
    grid.className = "candidate-grid";

    candidates.forEach((candidate, index) => {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = renderCandidateCard(candidate, index);
        const card = wrapper.firstElementChild;
        if (card) grid.appendChild(card);
    });

    if (!grid.children.length) {
        list.innerHTML = `<div class="candidate-empty">Candidate cards could not be rendered.</div>`;
        return;
    }

    list.appendChild(grid);
}

// No-op — kept so nothing breaks if called elsewhere
function wireFileActions(_container) {}

// ─── Main Dashboard Render ────────────────────────────────────────────────────
function renderDashboard() {
    if (!APP_DATA) return;

    const allCandidates = getAllCandidates();
    const filtered  = getFilteredCandidates();
    const shortlist = getTopCandidates();
    const stats     = computeSummaryStats(allCandidates);

    buildSummaryCards(stats);
    buildSkillFilters(uniqueSkills(allCandidates));

    const shortlistTabs  = document.getElementById("shortlistTabs");
    const shortlistCount = document.getElementById("shortlistCount");
    const count = document.getElementById("resultCount");
    const raw   = document.getElementById("rawOutput");

    if (shortlistCount) shortlistCount.textContent = `${shortlist.length} shortlisted resume(s)`;

    if (shortlistTabs) {
        shortlistTabs.innerHTML = shortlist.length
            ? shortlist.map((c, i) => renderTopCandidateCard(c, i)).join("")
            : `<div class="shortlist-tab"><div class="tab-name">No shortlisted candidates</div></div>`;

        shortlistTabs.querySelectorAll("[data-shortlist-index]").forEach(btn => {
            btn.addEventListener("click", () => {
                SELECTED_SHORTLIST_INDEX = Number(btn.getAttribute("data-shortlist-index") || 0);
                renderDashboard();
            });
        });
    }

    renderShortlistDetail(shortlist);

    if (count) count.textContent = `${filtered.length} candidate(s) shown`;

    renderRankedCandidates(filtered);

    if (raw) raw.textContent = JSON.stringify(APP_DATA, null, 2);
    const rawDetails = raw?.closest("details");
    if (rawDetails) rawDetails.open = false;
}

// ─── Filter listeners ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    const scoreFilter = document.getElementById("scoreFilter");
    const scoreValue  = document.getElementById("scoreValue");

    if (searchInput) searchInput.addEventListener("input", () => renderDashboard());

    if (scoreFilter) {
        scoreFilter.addEventListener("input", () => {
            if (scoreValue) scoreValue.textContent = scoreFilter.value;
            renderDashboard();
        });
    }
});

// ─── Analyze ──────────────────────────────────────────────────────────────────
async function analyze() {
    const jdText     = document.getElementById("jd_text")?.value?.trim();
    const filesInput = document.getElementById("files");
    const topN       = parseInt(document.getElementById("top_n")?.value || "5", 10);
    const btn        = document.getElementById("analyzeBtn");
    const dashboard  = document.getElementById("dashboard");

    if (!jdText) {
        setStatus("⚠️ Please enter a job description.", true);
        return;
    }
    if (!filesInput?.files?.length) {
        setStatus("⚠️ Please upload at least one resume file.", true);
        return;
    }

    setStatus("⏳ Analyzing resumes… please wait.");
    if (btn) btn.disabled = true;
    if (dashboard) dashboard.classList.add("hidden");

    const formData = new FormData();
    formData.append("jd_text", jdText);
    formData.append("top_n", topN);
    for (const file of filesInput.files) {
        formData.append("files", file);
    }

    try {
        const response = await fetch("/analyze", { method: "POST", body: formData });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        APP_DATA = data;
        SELECTED_SHORTLIST_INDEX = 0;
        ACTIVE_SKILL_FILTERS.clear();

        if (dashboard) dashboard.classList.remove("hidden");
        renderDashboard();
        setStatus(`✅ Analysis complete. ${data.total_candidates} candidate(s) ranked.`);
    } catch (err) {
        console.error("Analyze error:", err);
        setStatus(`❌ Error: ${err.message}`, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}
