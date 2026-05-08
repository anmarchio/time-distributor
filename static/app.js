const weekdays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday"
];

const ROUND_TO_MINUTES = 5;

let latestAllocation = null;

window.onload = () => {
    createDayInputs();
    addIssueRow();
};

function roundDownTo(value, step) {
    return Math.floor(value / step) * step;
}

function createDayInputs() {
    const container = document.getElementById("days");

    weekdays.forEach(day => {
        const row = document.createElement("div");
        row.className = "day-row";

        row.innerHTML = `
            <label>${day}</label>
            <input type="number" min="0" value="8" id="${day}-hours"> h
            <input type="number" min="0" max="59" value="0" id="${day}-minutes"> min
        `;

        container.appendChild(row);
    });
}

function addIssueRow() {
    const tbody = document.getElementById("issuesBody");
    const row = document.createElement("tr");

    row.innerHTML = `
        <td>
            <input type="text" placeholder="PROJA" class="jira-tag">
        </td>
        <td>
            <input type="text" placeholder="253" class="jira-number">
        </td>
        <td>
            <input type="url" placeholder="https://jira.example.com/browse/PROJA-253" class="jira-link">
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

function getWeeklyTimes() {
    const times = {};

    weekdays.forEach(day => {
        const hours = parseInt(document.getElementById(`${day}-hours`).value || "0", 10);
        const minutes = parseInt(document.getElementById(`${day}-minutes`).value || "0", 10);

        times[day] = hours * 60 + minutes;
    });

    return times;
}

function getIssues() {
    const rows = document.querySelectorAll("#issuesBody tr");
    const issues = [];

    rows.forEach(row => {
        const tag = row.querySelector(".jira-tag").value.trim();
        const number = row.querySelector(".jira-number").value.trim();
        const link = row.querySelector(".jira-link").value.trim();
        const weight = parseInt(row.querySelector(".jira-weight").value, 10);

        if (tag && number) {
            issues.push({
                tag,
                number,
                link,
                key: `${tag}-${number}`,
                weight
            });
        }
    });

    return issues;
}

function roundTo(value, step) {
    return Math.round(value / step) * step;
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
        const roundedMinutes = roundDownTo(rawMinutes, ROUND_TO_MINUTES);

        return {
            ...issue,
            remainingMinutes: roundedMinutes,
            totalBudgetMinutes: roundedMinutes
        };
    });

    let allocated = budgets.reduce((sum, b) => sum + b.remainingMinutes, 0);
    let diff = totalWeeklyMinutes - allocated;

    // Add remaining minutes safely, even if not divisible by 5
    let index = 0;

    while (diff > 0) {
        const add = Math.min(ROUND_TO_MINUTES, diff);

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

    weekdays.forEach(day => {
        dayCapacities[day] = {
            remaining: weeklyTimes[day],
            allocations: []
        };
    });

    for (const issue of issueBudgets) {
        const randomizedDays = shuffle(weekdays);

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
        result.innerHTML = "<p>Please add at least one Jira issue with tag and name.</p>";
        latestAllocation = null;
        return;
    }

    latestAllocation = allocateIssuesAcrossWeek(weeklyTimes, issues);

    renderIssueBudgets(latestAllocation.issueBudgets);
    renderDailyAllocations(latestAllocation.dayCapacities, weeklyTimes);
}

function renderIssueBudgets(issueBudgets) {
    const result = document.getElementById("result");

    const budgetBlock = document.createElement("div");
    budgetBlock.className = "result-day";

    let html = `
        <h3>Weekly Issue Budgets</h3>
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

        const issueDisplay = issue.link
            ? `<a href="${issue.link}" target="_blank">${issue.key}</a>`
            : issue.key;

        html += `
            <tr>
                <td>${issue.tag}</td>
                <td>${issue.number}</td>
                <td>${issueDisplay}</td>
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

    weekdays.forEach(day => {
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

            const issueDisplay = allocation.link
                ? `<a href="${allocation.link}" target="_blank">${allocation.key}</a>`
                : allocation.key;

            html += `
                <tr>
                    <td>${allocation.tag}</td>
                    <td>${allocation.number}</td>
                    <td>${issueDisplay}</td>
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

    weekdays.forEach(day => {
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
    link.download = "jira_time_distribution.csv";
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