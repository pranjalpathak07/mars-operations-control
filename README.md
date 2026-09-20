# Mars Operations Control

Mars Operations Control is a one-page decision simulator built for the Texas McCombs Operations Fellows Mars strategy exercise. It lets a reviewer change population, local production, inventory, resupply, and failure assumptions. Outputs update immediately.

## Scenarios

- Normal operations uses selected local capacities and planned resupply.
- Resupply delayed removes the next Earth delivery and extends the operating interval by 90 days.
- System failure reduces one selected local production system to the chosen remaining output.
- Population expansion raises the population to 45 as a quick stress test. The slider remains editable.

## Model logic

The model normalizes daily demand to a 20-person colony. Demand changes in direct proportion to population. Power includes a 10% operating reserve.

- `demand = base demand × population ÷ 20`
- `resource coverage = available supply ÷ demand`
- `shortage = demand - available supply`
- `days to shortage = usable inventory ÷ daily shortage`

The bottleneck is the resource with the lowest coverage. The decision rule is simple:
- Expand when water, food, and power are each at least 110% covered.
- Hold when every resource is at least 100% covered.
- Critical when any resource is below 100% coverage.

Earth dependency remains visible as a separate information metric. It is not part of a weighted score.

## Run locally

Open `index.html` directly in a browser, or serve the repository root with any static file server.

## External libraries and assets

None. The interface, visualization, calculations, and favicon use local HTML, CSS, JavaScript, and inline SVG.

## AI use

AI helped structure the operating variables, challenge assumptions, and implement the interactive simulator. Scenario testing was used to refine the recommendation logic.
