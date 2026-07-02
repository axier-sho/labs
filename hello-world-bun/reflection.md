# Reflection
## What did you ask Codex to build?
I asked Codex to ceate Simple TypeScript "hello world" program hat runs with Bun. It should print welcome message, ask user name, stores them in variable, and print greeting with their name included.

## What file or files did Codex create?
Codex made the main file, `index.ts` and `package.json` file so the project could be ran with Bun.

## What Bun command did you use to run the program?
```
bun run index.ts
```

## Did Codex get it right the first time?
Yes it did a good job following my instruction.

## What did you have to change, fix, or ask again?
I asked it to add some more feature like the lab instruction says and I also asked it to add some feature for the stretch lab.

## What extra feature did you add?
Text coloring and looping greeting until User responds with `quit`.

## What part of the TypeScript code do you understand best?
```typescript
console.log(colorize("Welcome to the Bun TypeScript hello world program!", "cyan"));
```
I understood this well because I actually used the program and then viewed this file and I found the text that the program said in this line with its printed color.
I understood that this command prints text with customisation.

## What part still feels confusing?
```
const colors = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};
```
I didn`t understand this part of the code which was on the first line of the code. I think this basicly defines the color, with some kind of color code but since I dont read color codes, this is very hard for me to read.

## Stretch credit changes
I added 2 features, the program keeps greeting people in loop until the user tyes `quit`, and if the user Enter without anything entered, the program will say `Please type a name so I know who to greet.` and keeps looping.
