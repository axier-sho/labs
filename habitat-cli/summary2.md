# Summary
## Difference between a resource catalog entry, local inventory, a blueprint, and a module.

### Resource catalog
List of resource types in Kepler world.
### Local inventory
Quantity of resources the habitat owns.(not implemented)
### Blueprints
Recipe describing what can be built. Lists the required input and output
### Modules
Instance you build from a blueprint.

## How inventory should be handled in later lab
Stored itens in local should be in `.habitat/inventory.json`, with resource types from the resources catalog. 

## Did I split `src/index.ts`
Yes. The code reduction was from 506 lines to 96 lines, whichout changing any core logic. This is significant interms of code management.