# CLI Discovery Notes

## 1. Installation Check
- Yes. `bun run build` + `bun link` succeeded.
```
fubar --version
1.0.0
```
## 2. First Theory
A local home simulator managing homes, rooms, devices.

## 3. Command Map
- Viewing: `status` / `list` (read-only)
- Common used for actions: `home` / `room` / `device`
- Managing database: `clear` 

### Extra viewing command discovered
- `fubar status` showed "My Home" with empty bathroom/bedroom/kitchen, plus `holiday_house`, which I created using fubar earlier.
- `fubar events list` history of home/room creation events.

## 5. Careful Change
- Prediction: `fubar room add gym` will add a room.
- Result: failed. multiple homes exist so it needed option `--home`. 

## 6. Structured Output (JSON)
- without json option: the table output. easy to read for humans.
- json style: `--json` option added, structured fields (ids, timestamps, metadata) with json style.

## 7. Explanation of Fubar
- For simulating/controlling a smart home locally.
- Important commands: `home`, `room`, `device`, `status`, `events`.
- Manages: homes, rooms, devices, sensors, automations, occupancy, and events.

## 8. fubar clear
- Wiped all datas ("FUBAR database cleared.")
- No confirmation prompt.
- No rewind possible

## 9. Codex Investigation
- Inspected the repo: `pwd`, listed files with `rg`, read `package.json`, `README.md`, `program.ts`, `smart-home-service.ts`, `types.ts`, `database.ts`, then ran `--help`.
- Went deeper than I did. It read the source code and double checked the `--help` with the original code to deepen its understanding of the CLI.

## 10. Codex Planning Questions
- Creatable objects: home, room, device, sensor, automation
- Commands: `fubar home create`, then `fubar room add "room_name" --home "home_name"`.

## 11. Codex Operating fubar
- `fubar home create "home_name"`, then `fubar room add kitchen/bathroom/bedroom --home "home_name"`.
- All three rooms was created correctly perfectly.

## 12. Codex Inspecting Results
- `fubar room list --home "home_name"` to list room names
- Bathroom, bedroom, kitchen so 3 rooms exist, matching what codex created.

## 13. Final Reflection
### How was your manual discovery process similar to Codex's discovery process?
We both used basicly used the same command, which reflected how AI could think like us humans, and how it can think by it self and ultlise tools to solve tasks.

### How did Codex move from discovering the tool to using it through natural language?
Codex read through the source code of fubar and understood how it works by also runing `--help` and runs the command with no mistake and giving final feedback at the end with English.