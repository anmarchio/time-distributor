let appConfig = {
    weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    defaultHoursPerDay: 8,
    defaultMinutesPerDay: 0,
    roundToMinutes: 5,
    jiraBaseUrl: "https://mycomp.atlassian.net/browse/",
    jiraTags: ["DEVOPS", "SOFTDEV", "MARKETING"]
};

let latestAllocation = null;

window.onload = async () => {
    await loadConfig();
    createTagOptions();
    createDayInputs();
    addIssueRow();
};

async function loadConfig() {
    try {
        const response = await fetch("/static/settings.json", { cache: "no-store" });

        if (!response.ok) {
            console.warn("No settings.json found. Using default appConfig.");
            return;
        }

        const fileConfig = await response.json();
        appConfig = {
            ...appConfig,
            ...fileConfig
        };
    } catch (error) {
        console.warn("Could not load settings.json. Using default appConfig.", error);
    }
}

function createTagOptions() {
    const datalist = document.getElementById("jiraTags");
    if (!datalist) return;

    datalist.innerHTML = "";

    appConfig.jiraTags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag;
        datalist.appendChild(option);
    });
}

function roundDownTo(value, step) {
    return Math.floor(value / step) * step;
}

function createDayInputs() {
    const container = document.getElementById("days");

    const calendarWeek = document.createElement("div");
    calendarWeek.className = "day-row";
    calendarWeek.innerHTML = `
        <label><i>Cal Week</i></label>
        <input type="number" min="1" value="${getCurrentCalendarWeek()}" id="calendar-week" style="background-color: #ADD8E6;">
    `;
    container.appendChild(calendarWeek);

    appConfig.weekdays.forEach(day => {
        const row = document.createElement("div");
        row.className = "day-row";

        row.innerHTML = `
            <label>${day}</label>
            <input type="number" min="0" value="${appConfig.defaultHoursPerDay}" id="${day}-hours"> h
            <input type="number" min="0" max="59" value="${appConfig.defaultMinutesPerDay}" id="${day}-minutes"> min
        `;

        container.appendChild(row);
    });
}

function addIssueRow() {
    const tbody = document.getElementById("issuesBody");
    const row = document.createElement("tr");

    row.innerHTML = `
        <td>
            <input type="text" list="jiraTags" placeholder="DEVOPS" class="jira-tag" oninput="updateGeneratedLink(this)">
        </td>
        <td>
            <input type="text" placeholder="2359" class="jira-number" oninput="updateGeneratedLink(this)">
        </td>
        <td>
            <a href="" target="_blank" rel="noopener noreferrer" class="generated-link"></a>
        </td>
        <td>
            <input type="range" min="1" max="5" value="3" class="jira-weight" oninput="updateWeightLabel(this)">
            <span class="weight-label">3</span>
        </td>
        <td>
            <button onclick="removeIssueRow(this)">Remove</button>
        </td>
    `;

    tbody.appendChild(row);
}

function removeIssueRow(button) {
    button.closest("tr").remove();
}

function updateWeightLabel(slider) {
    slider.nextElementSibling.textContent = slider.value;
}

function normalizeIssueTag(tag) {
    return tag.trim().toUpperCase();
}

function normalizeIssueNumber(number) {
    return number.trim().replace(/^#/, "");
}

function buildJiraIssueKey(tag, number) {
    return `${normalizeIssueTag(tag)}-${normalizeIssueNumber(number)}`;
}

function buildJiraIssueUrl(tag, number) {
    return `${appConfig.jiraBaseUrl}${encodeURIComponent(buildJiraIssueKey(tag, number))}`;
}

function updateGeneratedLink(input) {
    const row = input.closest("tr");
    const issue = getIssueFromRow(row);
    const linkElement = row.querySelector(".generated-link");

    if (!issue) {
        linkElement.removeAttribute("href");
        linkElement.textContent = "";
        return;
    }

    linkElement.href = issue.link;
    linkElement.textContent = issue.link;
}

function getWeeklyTimes() {
    const times = {};

    appConfig.weekdays.forEach(day => {
        const hours = parseInt(document.getElementById(`${day}-hours`).value || "0", 10);
        const minutes = parseInt(document.getElementById(`${day}-minutes`).value || "0", 10);

        times[day] = hours * 60 + minutes;
    });

    return times;
}

function getIssueFromRow(row) {
    const tag = normalizeIssueTag(row.querySelector(".jira-tag").value);
    const number = normalizeIssueNumber(row.querySelector(".jira-number").value);
    const weight = parseInt(row.querySelector(".jira-weight").value, 10);

    if (!tag || !number) {
        return null;
    }

    const key = buildJiraIssueKey(tag, number);
    const link = buildJiraIssueUrl(tag, number);

    return {
        tag,
        number,
        key,
        link,
        weight
    };
}

function getIssues() {
    const rows = document.querySelectorAll("#issuesBody tr");
    const issues = [];

    rows.forEach(row => {
        const issue = getIssueFromRow(row);
        if (issue) {
            issues.push(issue);
        }
    });

    return issues;
}

function shuffle(array) {
    return [...array].sort(() => Math.random() - 0.5);
}

function formatMinutes(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function computeWeeklyIssueBudgets(totalWeeklyMinutes, issues) {
    const totalWeight = issues.reduce((sum, issue) => sum + issue.weight, 0);

    let budgets = issues.map(issue => {
        const rawMinutes = totalWeeklyMinutes * (issue.weight / totalWeight);
        const roundedMinutes = roundDownTo(rawMinutes, appConfig.roundToMinutes);

        return {
            ...issue,
            remainingMinutes: roundedMinutes,
            totalBudgetMinutes: roundedMinutes
        };
    });

    let allocated = budgets.reduce((sum, b) => sum + b.remainingMinutes, 0);
    let diff = totalWeeklyMinutes - allocated;
    let index = 0;

    while (diff > 0) {
        const add = Math.min(appConfig.roundToMinutes, diff);

        budgets[index].remainingMinutes += add;
        budgets[index].totalBudgetMinutes += add;

        diff -= add;
        index = (index + 1) % budgets.length;
    }

    return budgets;
}

function allocateIssuesAcrossWeek(weeklyTimes, issues) {
    const totalWeeklyMinutes = Object.values(weeklyTimes).reduce((sum, minutes) => sum + minutes, 0);

    let issueBudgets = computeWeeklyIssueBudgets(totalWeeklyMinutes, issues);
    issueBudgets = shuffle(issueBudgets);

    const dayCapacities = {};

    appConfig.weekdays.forEach(day => {
        dayCapacities[day] = {
            remaining: weeklyTimes[day],
            allocations: []
        };
    });

    for (const issue of issueBudgets) {
        const randomizedDays = shuffle(appConfig.weekdays);

        for (const day of randomizedDays) {
            if (issue.remainingMinutes <= 0) break;

            const available = dayCapacities[day].remaining;
            if (available <= 0) continue;

            const assigned = Math.min(issue.remainingMinutes, available);

            if (assigned > 0) {
                dayCapacities[day].allocations.push({
                    tag: issue.tag,
                    number: issue.number,
                    link: issue.link,
                    key: issue.key,
                    weight: issue.weight,
                    minutes: assigned
                });

                dayCapacities[day].remaining -= assigned;
                issue.remainingMinutes -= assigned;
            }
        }
    }

    return {
        dayCapacities,
        issueBudgets
    };
}

function generateDistribution() {
    const weeklyTimes = getWeeklyTimes();
    const issues = getIssues();

    const result = document.getElementById("result");
    result.innerHTML = "";

    if (issues.length === 0) {
        result.innerHTML = "<p>Please add at least one Jira issue with tag and number.</p>";
        latestAllocation = null;
        return;
    }

    latestAllocation = allocateIssuesAcrossWeek(weeklyTimes, issues);

    renderIssueBudgets(latestAllocation.issueBudgets);
    renderDailyAllocations(latestAllocation.dayCapacities, weeklyTimes);
}
function getCurrentCalendarWeek() {
    const now = new Date();
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now - firstDayOfYear) / 86400000;

    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function renderIssueBudgets(issueBudgets) {
    const result = document.getElementById("result");

    const budgetBlock = document.createElement("div");
    budgetBlock.className = "result-day";

    const currentCalendarWeek = getCurrentCalendarWeek();

    let html = `
        <h3>Weekly Issue Budgets</h3>
        <p>Calendar Week:` + currentCalendarWeek + `</p>
        <table>
            <thead>
                <tr>
                    <th>Tag</th>
                    <th>Number</th>
                    <th>Issue</th>
                    <th>Weight</th>
                    <th>Weekly Budget</th>
                </tr>
            </thead>
            <tbody>
    `;

    issueBudgets.forEach(issue => {
        html += `
            <tr>
                <td>${issue.tag}</td>
                <td>${issue.number}</td>
                <td><a href="${issue.link}" target="_blank" rel="noopener noreferrer">${issue.key}</a></td>
                <td>${issue.weight}</td>
                <td>${formatMinutes(issue.totalBudgetMinutes)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    budgetBlock.innerHTML = html;
    result.appendChild(budgetBlock);
}

function renderDailyAllocations(dayCapacities, weeklyTimes) {
    const result = document.getElementById("result");

    appConfig.weekdays.forEach(day => {
        const dayBlock = document.createElement("div");
        dayBlock.className = "result-day";

        let html = `
            <h3>${day} — ${formatMinutes(weeklyTimes[day])}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Tag</th>
                        <th>Number</th>
                        <th>Issue</th>
                        <th>Weight</th>
                        <th>Allocated Time</th>
                    </tr>
                </thead>
                <tbody>
        `;

        dayCapacities[day].allocations.forEach(allocation => {
            html += `
                <tr>
                    <td>${allocation.tag}</td>
                    <td>${allocation.number}</td>
                    <td><a href="${allocation.link}" target="_blank" rel="noopener noreferrer">${allocation.key}</a></td>
                    <td>${allocation.weight}</td>
                    <td>${formatMinutes(allocation.minutes)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        dayBlock.innerHTML = html;
        result.appendChild(dayBlock);
    });
}

function downloadCSV() {
    if (!latestAllocation) {
        alert("Please generate a distribution first.");
        return;
    }

    const rows = [
        ["Day", "Tag", "Number", "Issue", "Link", "Weight", "Minutes", "Time"]
    ];

    appConfig.weekdays.forEach(day => {
        latestAllocation.dayCapacities[day].allocations.forEach(a => {
            rows.push([
                day,
                a.tag,
                a.number,
                a.key,
                a.link,
                a.weight,
                a.minutes,
                formatMinutes(a.minutes)
            ]);
        });
    });

    const csv = rows
        .map(row => row.map(escapeCSV).join(","))
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    const selectedCalendarWeek = document.getElementById("calendar-week").value;
    link.download = "kw" + selectedCalendarWeek + "_jira_time_distribution.csv";
    link.click();

    URL.revokeObjectURL(url);
}

function escapeCSV(value) {
    const stringValue = String(value);

    if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
    ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}
