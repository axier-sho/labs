const colors = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};

const colorize = (text: string, color: keyof typeof colors) =>
  `${colors[color]}${text}${colors.reset}`;

console.log(colorize("Welcome to the Bun TypeScript hello world program!", "cyan"));

while (true) {
  const name = prompt(colorize("What is your name? Type quit to exit.", "yellow"));
  const displayName = name?.trim();

  if (!displayName) {
    console.log(colorize("Please type a name so I know who to greet.", "red"));
    continue;
  }

  if (displayName.toLowerCase() === "quit") {
    console.log(colorize("Goodbye!", "cyan"));
    break;
  }

  console.log(
    `${colorize("Hello", "green")}, ${colorize(displayName, "yellow")}! Nice to meet you.`,
  );
}
