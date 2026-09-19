"use strict";

const CONFIG = {
  basePopulation: 20,
  baseDemand: { water: 20, food: 20, power: 22 },
  localScale: { water: 1, food: 1, power: 1 },
  earthShare: { water: 0.02, food: 0.45, power: 0 },
  inventoryDays: { water: 1, food: 1, power: 0.2 },
  powerReserve: 1.10,
  delayedResupplyDays: 90,
  weights: { capacity: 0.45, runway: 0.25, power: 0.20, dependency: 0.10 }
};

const defaults = { population: 20, water: 110, food: 55, power: 125, buffer: 75, resupply: 120, failedSystem: "water", failureSeverity: 25 };
const state = { ...defaults, scenario: "normal" };
const $ = id => document.getElementById(id);
const controls = ["population", "water", "food", "power", "buffer", "resupply", "failed-system", "failure-severity"];
const names = { water: "Water", food: "Food", power: "Power" };

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function round(value) { return Math.round(Number.isFinite(value) ? value : 0); }

function calculate() {
  const popFactor = state.population / CONFIG.basePopulation;
  const delay = state.scenario === "delay" ? CONFIG.delayedResupplyDays : 0;
  const effectiveInterval = state.resupply + delay;
  const resources = {};

  for (const key of ["water", "food", "power"]) {
    const demand = CONFIG.baseDemand[key] * popFactor * (key === "power" ? CONFIG.powerReserve : 1);
    let local = CONFIG.baseDemand[key] * (state[key] / 100) * CONFIG.localScale[key];
    if (state.scenario === "failure" && state.failedSystem === key) local *= state.failureSeverity / 100;
    const plannedEarth = demand * CONFIG.earthShare[key];
    const earth = state.scenario === "delay" ? 0 : plannedEarth;
    const available = local + earth;
    const deficit = Math.max(0, demand - available);
    const inventory = demand * CONFIG.inventoryDays[key] * state.buffer;
    const runway = deficit > 0 ? inventory / deficit : 999;
    const margin = (available - demand) / demand;
    resources[key] = { demand, local, earth, plannedEarth, available, deficit, inventory, runway, margin };
  }

  const bottleneckKey = Object.keys(resources).sort((a,b) => resources[a].margin - resources[b].margin)[0];
  const bottleneck = resources[bottleneckKey];
  const minCoverage = Math.min(...Object.values(resources).map(r => r.available / r.demand));
  const minRunway = Math.min(...Object.values(resources).filter(r => r.deficit > 0).map(r => r.runway).concat([999]));
  const totalDemand = Object.values(resources).reduce((s,r) => s + r.demand, 0);
  const earthDemand = Object.values(resources).reduce((s,r) => s + r.plannedEarth, 0);
  const dependency = earthDemand / totalDemand;
  const powerUtil = resources.power.demand / Math.max(resources.power.local, .01);
  const capacityScore = clamp(minCoverage, 0, 1) * 100;
  const runwayTarget = effectiveInterval;
  const runwayScore = minRunway === 999 ? 100 : clamp(minRunway / runwayTarget, 0, 1) * 100;
  const powerScore = clamp(1.25 - powerUtil, 0, 1) * 100;
  const dependencyScore = clamp(1 - dependency * 2, 0, 1) * 100;
  const readiness = round(capacityScore * CONFIG.weights.capacity + runwayScore * CONFIG.weights.runway + powerScore * CONFIG.weights.power + dependencyScore * CONFIG.weights.dependency);

  let phase = "HOLD";
  if (readiness >= 80 && bottleneck.margin >= .15 && (minRunway === 999 || minRunway >= effectiveInterval)) phase = "EXPAND";
  if (readiness < 55 || minRunway < delay || powerUtil > 1) phase = "CRITICAL";
  return { resources, bottleneckKey, bottleneck, minRunway, dependency, powerUtil, readiness, phase, effectiveInterval };
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
    $("recommendation-title").textContent = "Proceed to the next growth phase";
    $("recommendation-text").textContent = `All critical systems have operating headroom. ${b} remains the narrowest margin, so scale in small steps and recheck after each increase.`;
    $("next-gate").textContent = "Increase population by 10%";
  } else if (model.phase === "CRITICAL") {
    $("recommendation-title").textContent = `Stabilize ${b.toLowerCase()} immediately`;
    $("recommendation-text").textContent = `${b} cannot support the current plan. Reduce demand, restore production, or secure inventory before considering growth.`;
    $("next-gate").textContent = `${b} capacity at 100%+`;
  } else {
    $("recommendation-title").textContent = `Strengthen ${b.toLowerCase()} before expanding`;
    $("recommendation-text").textContent = `The current plan has limited resilience. Keep population steady while improving ${b.toLowerCase()} capacity, buffer, or resupply coverage.`;
    $("next-gate").textContent = `${b} margin at 15%+`;
  }
}

function render() {
  const model = calculate();
  $("population-output").textContent = `${state.population} people`;
  $("water-output").textContent = `${state.water}%`;
  $("food-output").textContent = `${state.food}%`;
  $("power-output").textContent = `${state.power}%`;
  $("failure-output").textContent = `${state.failureSeverity}%`;
  $("readiness").textContent = model.readiness;
  $("score-ring").style.background = `conic-gradient(var(--orange) 0 ${model.readiness}%, #39271f ${model.readiness}%)`;
  $("bottleneck").textContent = names[model.bottleneckKey];
  const earthShare = round(CONFIG.earthShare[model.bottleneckKey] * 100);
  $("bottleneck-detail").textContent = earthShare ? `${earthShare}% planned Earth support` : `${round(model.bottleneck.margin*100)}% operating margin`;
  $("runway").textContent = model.minRunway === 999 ? "Stable" : Math.max(0, round(model.minRunway));
  $("runway-detail").textContent = model.minRunway === 999 ? "No modeled resource deficit" : "Days of inventory at current deficit";
  $("power-util").textContent = `${round(model.powerUtil*100)}%`;
  $("power-detail").textContent = model.powerUtil <= 1 ? `${round((1-model.powerUtil)*100)}% generation headroom` : `${round((model.powerUtil-1)*100)}% over capacity`;
  $("earth-dependency").textContent = `${round(model.dependency*100)}%`;
  renderBars(model);
  renderRecommendation(model);
}

function readControls() {
  state.population = Number($("population").value); state.water = Number($("water").value); state.food = Number($("food").value); state.power = Number($("power").value);
  state.buffer = Number($("buffer").value); state.resupply = Number($("resupply").value); state.failedSystem = $("failed-system").value; state.failureSeverity = Number($("failure-severity").value);
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
    execute(input) { for (const key of ["population","water","food","power"]) if (input[key] != null) { state[key]=input[key]; $(key).value=input[key]; } if (input.scenario) state.scenario=input.scenario; render(); const m=calculate(); return { readiness:m.readiness, phase:m.phase, bottleneck:names[m.bottleneckKey], daysToShortage:m.minRunway===999?null:round(m.minRunway) }; }
  });
}

registerWebMCP();
render();

