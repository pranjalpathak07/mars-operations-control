"use strict";

const CONFIG = {
  basePopulation: 20,
  baseDemand: { water: 20, food: 20, power: 20 },
  localScale: { water: 1, food: 1, power: 1 },
  earthShare: { water: 0.02, food: 0.45, power: 0 },
  powerReserve: 1.10,
};

const defaults = { population: 20, water: 110, food: 55, power: 125, failedSystem: "water", failureSeverity: 25 };
const state = { ...defaults, scenario: "normal" };
const $ = id => document.getElementById(id);
const controls = ["population", "water", "food", "power", "failed-system", "failure-severity"];
const names = { water: "Water", food: "Food", power: "Power" };

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function round(value) { return Math.round(Number.isFinite(value) ? value : 0); }

function calculate() {
  const popFactor = state.population / CONFIG.basePopulation;
  const resources = {};

  for (const key of ["water", "food", "power"]) {
    const demand = CONFIG.baseDemand[key] * popFactor * (key === "power" ? CONFIG.powerReserve : 1);
    let local = CONFIG.baseDemand[key] * (state[key] / 100) * CONFIG.localScale[key];
    if (state.scenario === "failure" && state.failedSystem === key) local *= state.failureSeverity / 100;
    const plannedEarth = demand * CONFIG.earthShare[key];
    const earth = state.scenario === "delay" ? 0 : plannedEarth;
    const available = local + earth;
    const deficit = Math.max(0, demand - available);
    const margin = (available - demand) / demand;
    resources[key] = { demand, local, earth, plannedEarth, available, deficit, margin };
  }

  const bottleneckKey = Object.keys(resources).sort((a,b) => resources[a].margin - resources[b].margin)[0];
  const bottleneck = resources[bottleneckKey];
  const minCoverage = Math.min(...Object.values(resources).map(r => r.available / r.demand));
  const lowestCoverage = round(minCoverage * 100);
  const totalDemand = Object.values(resources).reduce((s,r) => s + r.demand, 0);
  const earthDemand = Object.values(resources).reduce((s,r) => s + r.earth, 0);
  const dependency = earthDemand / totalDemand;
  const powerUtil = resources.power.demand / Math.max(resources.power.local, .01);
  const bottleneckShortage = round((bottleneck.deficit / bottleneck.demand) * 100);

  let phase = "CRITICAL";
  if (minCoverage >= 1.10) phase = "EXPAND";
  else if (minCoverage >= 1.00) phase = "HOLD";

  return { resources, bottleneckKey, bottleneck, bottleneckShortage, dependency, powerUtil, lowestCoverage, phase };
}

function renderBars(model) {
  $("resource-bars").innerHTML = ["water", "food", "power"].map(key => {
    const r = model.resources[key];
    const scale = Math.max(r.demand * 1.5, r.available);
    const localWidth = clamp(r.local / scale * 100, 0, 100);
    const earthWidth = clamp(r.earth / scale * 100, 0, 100 - localWidth);
    const coverage = round(r.available / r.demand * 100);
    const status = r.margin >= .15 ? `Stable · ${round(r.margin * 100)}% margin` : r.margin >= 0 ? `Tight · ${round(r.margin * 100)}% margin` : `Deficit · ${Math.abs(round(r.margin * 100))}% short`;
    return `<div class="resource-row"><span class="resource-name">${names[key]}</span><div class="bar-track" aria-label="${names[key]} capacity ${coverage}% of demand"><div class="bar-stack" style="width:${localWidth + earthWidth}%"><span class="bar-local" style="width:${localWidth/(localWidth+earthWidth||1)*100}%"></span><span class="bar-earth" style="width:${earthWidth/(localWidth+earthWidth||1)*100}%"></span></div><span class="demand-marker" title="Demand"></span></div><span class="bar-value">${coverage}%</span><span class="status-text">${status}</span></div>`;
  }).join("");
}

function renderRecommendation(model) {
  const box = $("recommendation");
  box.className = "recommendation " + model.phase.toLowerCase();
  $("recommendation-badge").textContent = model.phase;
  const b = names[model.bottleneckKey];
  if (model.phase === "EXPAND") {
    $("recommendation-title").textContent = "Current systems can support growth";
    $("recommendation-text").textContent = `Every critical resource is at least 110% covered. ${b} is still the weakest resource, so increase population in small steps and recheck the model.`;
    $("next-gate").textContent = "Increase population gradually";
  } else if (model.phase === "CRITICAL") {
    $("recommendation-title").textContent = `Stabilize ${b.toLowerCase()} immediately`;
    $("recommendation-text").textContent = `${b} supply is below current demand. Reduce demand or restore production before considering growth.`;
    $("next-gate").textContent = `${b} coverage at 100%+`;
  } else {
    $("recommendation-title").textContent = `Strengthen ${b.toLowerCase()} before expanding`;
    $("recommendation-text").textContent = `Current demand is covered, but the weakest resource has less than 10% spare capacity. Improve ${b.toLowerCase()} before growing the colony.`;
    $("next-gate").textContent = `${b} coverage at 110%+`;
  }
}

function render() {
  const model = calculate();
  $("population-output").textContent = `${state.population} people`;
  $("water-output").textContent = `${state.water}%`;
  $("food-output").textContent = `${state.food}%`;
  $("power-output").textContent = `${state.power}%`;
  $("failure-output").textContent = `${state.failureSeverity}%`;
  $("readiness").textContent = model.lowestCoverage;
  const ringValue = clamp(model.lowestCoverage, 0, 100);
  $("score-ring").style.background = `conic-gradient(var(--orange) 0 ${ringValue}%, #39271f ${ringValue}%)`;
  $("bottleneck").textContent = names[model.bottleneckKey];
  const earthShare = round(CONFIG.earthShare[model.bottleneckKey] * 100);
  $("bottleneck-detail").textContent = earthShare ? `${earthShare}% planned Earth support` : `${round(model.bottleneck.margin*100)}% operating margin`;
  $("shortage").textContent = `${model.bottleneckShortage}%`;
  $("shortage-detail").textContent = model.bottleneckShortage === 0 ? "No shortage in the weakest resource" : `${names[model.bottleneckKey]} demand currently unmet`;
  $("power-util").textContent = `${round(model.powerUtil*100)}%`;
  $("power-detail").textContent = model.powerUtil <= 1 ? `${round((1-model.powerUtil)*100)}% generation headroom` : `${round((model.powerUtil-1)*100)}% over capacity`;
  $("earth-dependency").textContent = `${round(model.dependency*100)}%`;
  renderBars(model);
  renderRecommendation(model);
}

function readControls() {
  state.population = Number($("population").value); state.water = Number($("water").value); state.food = Number($("food").value); state.power = Number($("power").value);
  state.failedSystem = $("failed-system").value; state.failureSeverity = Number($("failure-severity").value);
  render();
}

controls.forEach(id => $(id).addEventListener("input", readControls));
document.querySelectorAll(".scenario").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".scenario").forEach(b => { b.classList.toggle("active", b === button); b.setAttribute("aria-pressed", String(b === button)); });
  state.scenario = button.dataset.scenario;
  if (state.scenario === "expansion") { $("population").value = 45; }
  $("failure-control").hidden = state.scenario !== "failure";
  $("scenario-chip").textContent = button.textContent.trim().replace(/^\d+\s*/, "");
  readControls();
}));

$("reset").addEventListener("click", () => {
  Object.assign(state, defaults, { scenario: "normal" });
  for (const [key,value] of Object.entries(defaults)) { const el = $(key.replace(/[A-Z]/g,m=>`-${m.toLowerCase()}`)); if (el) el.value = value; }
  document.querySelectorAll(".scenario").forEach((b,i) => { b.classList.toggle("active", i===0); b.setAttribute("aria-pressed", String(i===0)); });
  $("failure-control").hidden = true; $("scenario-chip").textContent = "Normal operations"; render();
});

const assumptionsDialog = $("assumptions-dialog");
$("open-assumptions").addEventListener("click", () => assumptionsDialog.showModal());
assumptionsDialog.querySelector(".close-button").addEventListener("click", () => assumptionsDialog.close());
const guideDialog = $("guide-dialog");
$("open-guide").addEventListener("click", () => guideDialog.showModal());
guideDialog.querySelector(".close-button").addEventListener("click", () => guideDialog.close());
const formulaDialog = $("formula-dialog");
$("show-formula").addEventListener("click", () => formulaDialog.showModal());
formulaDialog.querySelector(".close-button").addEventListener("click", () => formulaDialog.close());
for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

function registerWebMCP() {
  if (!document.modelContext?.registerTool) return;
  document.modelContext.registerTool({
    name: "configure_mars_simulation", title: "Configure Mars simulation",
    description: "Set Mars colony operating inputs and scenario, then return the updated decision result.",
    inputSchema: { type: "object", properties: { population:{type:"number",minimum:8,maximum:80}, scenario:{type:"string",enum:["normal","delay","failure","expansion"]}, water:{type:"number",minimum:30,maximum:160}, food:{type:"number",minimum:20,maximum:140}, power:{type:"number",minimum:50,maximum:180} }, additionalProperties:false },
    annotations: { readOnlyHint:false, untrustedContentHint:false },
    execute(input) { for (const key of ["population","water","food","power"]) if (input[key] != null) { state[key]=input[key]; $(key).value=input[key]; } if (input.scenario) state.scenario=input.scenario; render(); const m=calculate(); return { lowestCoverage:m.lowestCoverage, phase:m.phase, bottleneck:names[m.bottleneckKey], shortagePercent:m.bottleneckShortage }; }
  });
}

registerWebMCP();
render();

