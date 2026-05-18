function safeArray(value) {
    return Array.isArray(value) ? value : (value ? [value] : []);
}

function renderCandidateCard(candidate, index) {
    try {
        const data = candidate.extracted_data || {};
        const score = Number(candidate.scores?.overall_score || 0);
        const skill = Number(candidate.scores?.skill_score || 0);
        const exp = Number(candidate.scores?.experience_score || 0);
        const edu = Number(candidate.scores?.education_score || 0);

        const matched = safeArray(candidate.matched_skills);
        const missing = safeArray(candidate.missing_skills);
        const highlights = safeArray(candidate.highlights);

        const education = safeArray(data.education);
        const projects = safeArray(data.projects);
        const certs = safeArray(data.certifications);
        const companies = safeArray(data.companies);

        return `
            <article class="candidate-card">
                <div class="candidate-head">
                    <div>
                        <div class="rank-badge">#${candidate.rank || (index + 1)}</div>
                        <h3 class="candidate-name">${escapeHtml(data.name || "Unknown Candidate")}</h3>
                        <div class="candidate-meta">
                            ${escapeHtml(candidate.filename || "")}<br/>
                            ${escapeHtml(data.email || "No email")} ${data.phone ? " • " + escapeHtml(data.phone) : ""}
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
                    ${matched.length ? matched.map(s => `<span class="skill-chip">${escapeHtml(s)}</span>`).join("") : `<span style="color:#64748b;">No matched skills</span>`}
                </div>

                <div class="section-title">Missing Skills</div>
                <div class="chips">
                    ${missing.length ? missing.map(s => `<span class="skill-chip missing-chip">${escapeHtml(s)}</span>`).join("") : `<span style="color:#64748b;">No missing skills</span>`}
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
                    <button class="mini-btn" data-view="${escapeHtml(candidate.filename)}">View</button>
                    <button class="mini-btn ghost-btn" data-download="${escapeHtml(candidate.filename)}">Download</button>
                </div>

                <details>
                    <summary>Show extracted resume details</summary>

                    <div class="section-title">Companies</div>
                    <div class="chips">
                        ${companies.length ? companies.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("") : `<span style="color:#64748b;">None</span>`}
                    </div>

                    <div class="section-title">Education</div>
                    <div class="chips">
                        ${education.length ? education.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("") : `<span style="color:#64748b;">None</span>`}
                    </div>

                    <div class="section-title">Projects</div>
                    <div class="chips">
                        ${projects.length ? projects.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("") : `<span style="color:#64748b;">None</span>`}
                    </div>

                    <div class="section-title">Certifications</div>
                    <div class="chips">
                        ${certs.length ? certs.map(v => `<span class="skill-chip">${escapeHtml(v)}</span>`).join("") : `<span style="color:#64748b;">None</span>`}
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
    list.innerHTML = "";

    if (!candidates.length) {
        list.innerHTML = `
            <div class="candidate-empty">
                No ranked candidates to show.
            </div>
        `;
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
        list.innerHTML = `
            <div class="candidate-empty">
                Candidate cards could not be rendered.
            </div>
        `;
        return;
    }

    list.appendChild(grid);
}

function renderDashboard() {
    if (!APP_DATA) return;

    const allCandidates = getAllCandidates();
    const filtered = getFilteredCandidates();
    const shortlist = getTopCandidates();
    const stats = computeSummaryStats(allCandidates);

    buildSummaryCards(stats);
    buildSkillFilters(uniqueSkills(allCandidates));

    const shortlistTabs = document.getElementById("shortlistTabs");
    const shortlistCount = document.getElementById("shortlistCount");
    const shortlistDetail = document.getElementById("shortlistDetail");
    const list = document.getElementById("candidateList");
    const count = document.getElementById("resultCount");
    const raw = document.getElementById("rawOutput");

    shortlistCount.textContent = `${shortlist.length} shortlisted resume(s)`;

    shortlistTabs.innerHTML = shortlist.length
        ? shortlist.map((candidate, index) => renderTopCandidateCard(candidate, index)).join("")
        : `<div class="shortlist-tab"><div class="tab-name">No shortlisted candidates</div></div>`;

    shortlistTabs.querySelectorAll("[data-shortlist-index]").forEach(btn => {
        btn.addEventListener("click", () => {
            SELECTED_SHORTLIST_INDEX = Number(btn.getAttribute("data-shortlist-index") || 0);
            renderDashboard();
        });
    });

    renderShortlistDetail(shortlist);

    count.textContent = `${filtered.length} candidate(s) shown`;

    renderRankedCandidates(filtered);

    wireFileActions(list);

    raw.textContent = JSON.stringify(APP_DATA, null, 2);

    const rawDetails = raw.closest("details");
    if (rawDetails) rawDetails.open = false;
}