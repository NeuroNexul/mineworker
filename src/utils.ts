/**
 * Clears the last n lines from the terminal.
 * @param n The number of lines to clear.
 */
export function clearLastLines(n: number) {
  // \x1B[<n>A moves the cursor up n lines.
  // \x1B[J clears from the cursor to the end of the screen.
  process.stdout.write(`\x1B[${n}A\x1B[J`);
}

// export async function awaitForInput(prompt = "Press Enter key to continue...") {
//   process.stdout.write(prompt);

//   for await (const line of console) {
//     break;
//   }
// }

export async function waitForEnter() {
  process.stdout.write("Press Enter to continue...");
  const stdin = process.stdin;

  // Set stdin to raw mode to read individual key presses
  stdin.setRawMode(true);
  stdin.resume(); // Resume stdin to start listening for input
  stdin.setEncoding("utf8");

  return new Promise<void>((resolve) => {
    function func(key: string) {
      // Check if the pressed key is Enter (key code 13 or '\r')
      if (key === "\r") {
        stdin.pause(); // Pause stdin to stop listening
        stdin.setRawMode(false); // Restore raw mode
        resolve();

        stdin.off("data", func); // Remove the listener after resolving
      }
    }

    stdin.on("data", func);
  });
}
