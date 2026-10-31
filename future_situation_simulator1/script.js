
const $ = id => document.getElementById(id);

const HISTORY_KEY = "fss_history";
const USER_KEY = "fss_user";
const CURRENT_KEY = "fss_current";

let mode = "login";
let latest = null;

let zones = [
    { name: "Main Gate", capacity: 300, people: 120 },
    { name: "Central Plaza", capacity: 500, people: 180 },
    { name: "Food Court", capacity: 250, people: 80 },
    { name: "Exit Corridor", capacity: 200, people: 40 }
];

function read(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function historyData() {
    return read(HISTORY_KEY, []);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function risk(value) {
    if (value >= 100) return "Critical";
    if (value >= 80) return "High";
    if (value >= 55) return "Medium";
    return "Low";
}

function toast(message) {
    const box = $("toast");
    box.textContent = message;
    box.classList.add("show");

    setTimeout(() => {
        box.classList.remove("show");
    }, 2400);
}

/* AUTHENTICATION DEMO */

function updateAuthMode() {
    $("name").classList.toggle("hide", mode === "login");

    $("authTitle").textContent =
        mode === "login"
            ? "Sign in to your workspace"
            : "Create your workspace account";

    $("authSubmit").textContent =
        mode === "login" ? "Sign in →" : "Create account →";

    $("switchLine").innerHTML =
        mode === "login"
            ? 'New here? <button class="link" id="switch">Create an account</button>'
            : 'Already registered? <button class="link" id="switch">Sign in</button>';

    $("switch").onclick = () => {
        mode = mode === "login" ? "register" : "login";
        updateAuthMode();
    };
}

function enter(user) {
    $("auth").classList.add("hide");
    $("app").classList.remove("hide");

    $("greeting").textContent =
        "Good to see you, " + user.name;

    renderAll();
    go("overview");
}

function authSetup() {
    updateAuthMode();

    $("authForm").onsubmit = event => {
        event.preventDefault();

        const email = $("email").value.trim();
        const name =
            $("name").value.trim() ||
            email.split("@")[0];

        const user = { name, email };

        write(USER_KEY, user);
        enter(user);
    };

    $("guest").onclick = () => {
        enter({ name: "Guest" });
    };

    $("logout").onclick = () => {
        localStorage.removeItem(USER_KEY);

        $("app").classList.add("hide");
        $("auth").classList.remove("hide");
    };
}

/* NAVIGATION */

function go(page) {
    document.querySelectorAll(".page").forEach(section => {
        section.classList.remove("show");
    });

    $(page).classList.add("show");

    $("crumb").textContent =
        page.charAt(0).toUpperCase() + page.slice(1);

    document.querySelectorAll("[data-page]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    $("sidebar").classList.remove("open");

    if (page === "risk") renderRisk();
    if (page === "actions") renderActions();
    if (page === "history") renderHistory();
}

document.querySelectorAll("[data-page]").forEach(button => {
    button.onclick = () => go(button.dataset.page);
});

document.querySelectorAll("[data-goto]").forEach(button => {
    button.onclick = () => go(button.dataset.goto);
});

$("menu").onclick = () => {
    $("sidebar").classList.toggle("open");
};

/* ZONE INPUTS */

function renderZoneInputs() {
    $("zoneInputs").innerHTML = zones.map((zone, index) => `
        <div class="zoneinput">
            <span>${escapeHTML(zone.name)}</span>

            <input
                class="field cap"
                data-i="${index}"
                type="number"
                min="1"
                value="${zone.capacity}"
                aria-label="${escapeHTML(zone.name)} capacity"
            >

            <input
                class="field ppl"
                data-i="${index}"
                type="number"
                min="0"
                value="${zone.people}"
                aria-label="${escapeHTML(zone.name)} people"
            >
        </div>
    `).join("");
}

/* CROWD SIMULATION ENGINE */

function runModel(config) {
    let result = config.zones.map(zone => ({ ...zone }));

    for (let minute = 0; minute < config.duration; minute++) {

        // New arrivals enter the first zone.
        result[0].people += Math.min(
            config.arrival,
            Math.max(0, result[0].capacity - result[0].people)
        );

        // Simplified movement between zones.
        for (let i = 0; i < result.length - 1; i++) {

            const movement = Math.min(
                result[i].people,
                Math.max(
                    0,
                    result[i + 1].capacity - result[i + 1].people
                ),
                Math.ceil(result[i].people * 0.08)
            );

            result[i].people -= movement;
            result[i + 1].people += movement;
        }

        // People leave from the final zone.
        const last = result.length - 1;

        result[last].people = Math.max(
            0,
            result[last].people - config.exit
        );
    }

    const finalZones = result.map(zone => {
        const density = Math.round(
            (zone.people / zone.capacity) * 100
        );

        return {
            ...zone,
            density,
            risk: risk(density)
        };
    });

    const total = finalZones.reduce(
        (sum, zone) => sum + zone.people,
        0
    );

    const riskLevels = [
        "Low",
        "Medium",
        "High",
        "Critical"
    ];

    const overallRisk = finalZones.reduce(
        (highest, zone) =>
            riskLevels.indexOf(zone.risk) >
            riskLevels.indexOf(highest)
                ? zone.risk
                : highest,
        "Low"
    );

    return {
        space: config.space,
        arrival: config.arrival,
        exit: config.exit,
        duration: config.duration,
        zones: finalZones,
        total,
        risk: overallRisk,
        date: new Date().toISOString()
    };
}

/* MAP DISPLAY */

function mapHTML(data) {
    return data.zones.map(zone => `
        <div class="zone ${zone.risk.toLowerCase()}">
            <b>${escapeHTML(zone.name)}</b>
            <span>
                ${zone.people} people · ${zone.density}%
            </span>
        </div>
    `).join("");
}

/* SIMULATION RESULTS */

function drawResults(data) {
    latest = data;

    $("emptyResult").classList.add("hide");
    $("results").classList.remove("hide");

    $("resultStatus").textContent = "MODEL COMPLETED";

    $("rCrowd").textContent =
        data.total.toLocaleString();

    $("rRisk").textContent = data.risk;

    $("resultMap").innerHTML = mapHTML(data);

    $("zoneResults").innerHTML = data.zones.map(zone => `
        <div class="resultbar">
            <b>${escapeHTML(zone.name)}</b>

            <div class="track">
                <div
                    class="fill ${zone.risk.toLowerCase()}"
                    style="width:${Math.min(100, zone.density)}%"
                ></div>
            </div>

            ${zone.density}%
        </div>
    `).join("");
}

/* RUN BUTTON */

$("duration").oninput = () => {
    $("durationText").textContent =
        $("duration").value + " min";
};

$("simForm").onsubmit = event => {
    event.preventDefault();

    const newZones = [];

    for (let i = 0; i < zones.length; i++) {
        const capacity =
            Number(document.querySelector(
                `.cap[data-i="${i}"]`
            ).value);

        const people =
            Number(document.querySelector(
                `.ppl[data-i="${i}"]`
            ).value);

        if (
            !Number.isFinite(capacity) ||
            !Number.isFinite(people) ||
            capacity < 1 ||
            people < 0
        ) {
            toast("Enter valid zone values.");
            return;
        }

        newZones.push({
            ...zones[i],
            capacity,
            people
        });
    }

    const arrival = Number($("arrival").value);
    const exit = Number($("exit").value);

    if (
        !Number.isFinite(arrival) ||
        !Number.isFinite(exit) ||
        arrival < 0 || arrival > 500 ||
        exit < 0 || exit > 500
    ) {
        toast("Arrival and exit must be between 0 and 500.");
        return;
    }

    zones = newZones;

    const data = runModel({
        space: $("space").value,
        arrival,
        exit,
        duration: Number($("duration").value),
        zones
    });

    write(CURRENT_KEY, data);

    drawResults(data);
    renderOverview();

    toast("Simulation completed.");
};

/* SAVE SCENARIO */

$("save").onclick = () => {
    if (!latest) return;

    const history = historyData();

    history.unshift({
        ...latest,
        id: Date.now()
    });

    write(HISTORY_KEY, history.slice(0, 50));

    renderAll();

    toast("Scenario saved successfully.");
};

/* DEFAULT MODEL */

function fallback() {
    const defaultZones = zones.map(zone => {
        const density = Math.round(
            zone.people / zone.capacity * 100
        );

        return {
            ...zone,
            density,
            risk: risk(density)
        };
    });

    return {
        zones: defaultZones,
        total: defaultZones.reduce(
            (sum, zone) => sum + zone.people,
            0
        ),
        risk: "Medium"
    };
}

/* OVERVIEW */

function renderOverview() {
    const data =
        latest ||
        read(CURRENT_KEY, null) ||
        fallback();

    const highestZone = [...data.zones].sort(
        (a, b) => b.density - a.density
    )[0];

    $("mCrowd").textContent = data.total;
    $("mRisk").textContent = data.risk;
    $("mZones").textContent = data.zones.length;
    $("mSaved").textContent = historyData().length;

    $("map").innerHTML = mapHTML(data);

    $("highest").textContent =
        highestZone.density + "%";

    $("focus").textContent = highestZone.name;

    $("insight").textContent =
        highestZone.density >= 80
            ? `${highestZone.name} is at ${highestZone.density}% of configured capacity in this model. Review assumptions and compare alternatives.`
            : "No zone currently reaches 80% in this model. Test different arrival and exit assumptions.";

    $("recent").innerHTML = historyData()
        .slice(0, 3)
        .map(item => `
            <div>
                <b>${escapeHTML(item.space)}</b>
                <small>
                    ${new Date(item.date).toLocaleString()}
                    · ${item.total} estimated people
                    · ${item.risk}
                </small>
            </div>
        `)
        .join("") || "No saved simulations yet.";
}

/* RISK ANALYSIS */

function renderRisk() {
    const data =
        latest ||
        read(CURRENT_KEY, null) ||
        fallback();

    $("riskOverall").textContent = data.risk;

    $("riskRows").innerHTML = data.zones.map(zone => `
        <div class="riskrow">

            <div>
                <b>${escapeHTML(zone.name)}</b>
                <small>${zone.people} / ${zone.capacity}</small>
            </div>

            <div class="track">
                <div
                    class="fill ${zone.risk.toLowerCase()}"
                    style="width:${Math.min(100, zone.density)}%"
                ></div>
            </div>

            <b>${zone.density}% · ${zone.risk}</b>

        </div>
    `).join("");

    const alerts = data.zones.filter(
        zone => zone.density >= 80
    );

    $("bottlenecks").innerHTML =
        alerts.map(zone => `
            <p>
                <b>${escapeHTML(zone.name)} · ${zone.risk} indicator</b>
                <br>
                Modelled occupancy is ${zone.density}% of configured capacity.
                Review assumptions with qualified venue professionals.
            </p>
        `).join("") ||
        "<p>No zone is at or above 80% in this model.</p>";
}

/* PREVENTIVE ACTION LAB */

function renderActions() {
    const data = latest || fallback();

    const top = [...data.zones].sort(
        (a, b) => b.density - a.density
    )[0];

    const ideas = [
        [
            "Current Model Focus",
            `${top.name} has the highest modelled density (${top.density}%). Treat this as a prompt to review inputs, not a safety determination.`,
            "Review scenario assumptions"
        ],
        [
            "Review Entry Assumptions",
            "Test how a different arrival-rate input changes the estimated distribution.",
            "Compare arrival-rate scenarios"
        ],
        [
            "Review Circulation Layout",
            "Check whether the zone sequence represents the actual layout and accessible routes.",
            "Validate with venue planners"
        ],
        [
            "Review Exit Assumptions",
            "Explore how changing the exit-rate assumption affects the model total.",
            "Use reliable venue data"
        ],
        [
            "Monitoring Checkpoints",
            "Consider where trained staff might observe changing conditions in an actual venue.",
            "Requires venue-specific review"
        ]
    ];

    $("actionCards").innerHTML = ideas.map(
        (item, index) => `
            <article class="action">
                <small>PLANNING IDEA 0${index + 1}</small>
                <h3>${item[0]}</h3>
                <p>${item[1]}</p>
                <span>${item[2]}</span>
            </article>
        `
    ).join("");
}

/* A/B COMPARISON */

$("compareBtn").onclick = () => {
    const scenarioA =
        latest || read(CURRENT_KEY, null);

    if (!scenarioA) {
        toast("Run Scenario A first.");
        return;
    }

    const arrival = Number($("bArrival").value);
    const exit = Number($("bExit").value);

    if (
        !Number.isFinite(arrival) ||
        !Number.isFinite(exit) ||
        arrival < 0 || arrival > 500 ||
        exit < 0 || exit > 500
    ) {
        toast("Enter valid arrival and exit rates.");
        return;
    }

    const adjustment = Number($("bCapacity").value);

    const adjustedZones = scenarioA.zones.map(zone => ({
        ...zone,
        capacity: Math.max(
            1,
            Math.round(zone.capacity * (1 + adjustment / 100))
        )
    }));

    const scenarioB = runModel({
        space: scenarioA.space,
        arrival,
        exit,
        duration: scenarioA.duration,
        zones: adjustedZones
    });

    function comparisonCard(data, title) {
        return `
            <article class="comparecard">
                <h3>Scenario ${title}</h3>
                <strong>${data.total}</strong>
                <p>
                    Estimated crowd · ${data.risk} overall indicator
                </p>

                ${data.zones.map(zone => `
                    <div class="split">
                        <span>${escapeHTML(zone.name)}</span>
                        <b>${zone.density}% · ${zone.risk}</b>
                    </div>
                `).join("")}
            </article>
        `;
    }

    $("compareResults").innerHTML =
        comparisonCard(scenarioA, "A") +
        comparisonCard(scenarioB, "B");

    $("conclusion").classList.remove("hide");

    $("conclusion").textContent =
        scenarioB.total < scenarioA.total
            ? "Scenario B has a lower estimated crowd total in this simplified model."
            : scenarioB.total > scenarioA.total
                ? "Scenario A has a lower estimated crowd total in this simplified model."
                : "Both scenarios have the same estimated crowd total.";

    $("conclusion").textContent +=
        " This is not a real-world prediction.";
};

/* SIMULATION HISTORY */

function renderHistory() {
    const history = historyData();

    $("count").textContent =
        history.length + " SAVED";

    $("historyRows").classList.toggle(
        "empty",
        history.length === 0
    );

    $("historyRows").innerHTML = history.map(item => `
        <div class="historyitem">

            <div>
                <b>${escapeHTML(item.space)}</b>
                <small>
                    ${new Date(item.date).toLocaleString()}
                    · ${item.duration} min
                    · ${item.total} people
                </small>
            </div>

            <div>
                <button data-load="${item.id}">Load</button>
                <button data-del="${item.id}">Delete</button>
            </div>

        </div>
    `).join("") || "No saved scenarios yet.";

    document.querySelectorAll("[data-load]").forEach(button => {
        button.onclick = () => {
            const item = historyData().find(
                x => x.id == button.dataset.load
            );

            if (!item) return;

            latest = item;
            zones = item.zones.map(zone => ({
                name: zone.name,
                capacity: zone.capacity,
                people: zone.people
            }));

            drawResults(item);
            go("simulation");
            renderZoneInputs();
        };
    });

    document.querySelectorAll("[data-del]").forEach(button => {
        button.onclick = () => {
            const updated = historyData().filter(
                x => x.id != button.dataset.del
            );

            write(HISTORY_KEY, updated);

            renderAll();
            renderHistory();

            toast("Scenario deleted.");
        };
    });
}

/* EXPORT HISTORY */

$("export").onclick = () => {
    const data = historyData();

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "future-simulator-history.json";

    link.click();

    URL.revokeObjectURL(url);
};

/* REFRESH ALL SECTIONS */

function renderAll() {
    const saved = read(CURRENT_KEY, null);

    if (saved) {
        latest = saved;

        zones = saved.zones.map(zone => ({
            name: zone.name,
            capacity: zone.capacity,
            people: zone.people
        }));
    }

    renderZoneInputs();
    renderOverview();
    renderRisk();
    renderActions();

    if (saved) {
        drawResults(saved);
    }
}

/* START APPLICATION */

authSetup();

const savedUser = read(USER_KEY, null);

if (savedUser) {
    enter(savedUser);
}
