import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { provisionVerifiedTestProcurementOfficer } from "./lib/provision-test-procurement-officer";

type CommandArguments = {
  email: string;
  username: string;
};

function parseArguments(argumentsList: string[]): CommandArguments {
  const values = new Map<string, string>();

  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];

    if ((flag !== "--email" && flag !== "--username") || !value) {
      throw new Error(
        "Usage: npm.cmd run provision:test-procurement-officer -- --email <email> --username <username>",
      );
    }

    values.set(flag, value);
  }

  const email = values.get("--email");
  const username = values.get("--username");

  if (!email || !username || values.size !== 2) {
    throw new Error(
      "Both --email and --username must be provided exactly once.",
    );
  }

  return { email, username };
}

async function readHiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("A TTY is required to enter the password securely.");
  }

  process.stdout.write("Password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolvePassword, rejectPassword) => {
    let password = "";

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", handleInput);
    }

    function handleInput(chunk: Buffer) {
      const value = chunk.toString("utf8");

      if (value === "\r" || value === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolvePassword(password);
        return;
      }

      if (value === "\u0003") {
        cleanup();
        rejectPassword(new Error("Provisioning cancelled."));
        return;
      }

      if (value === "\u007f" || value === "\b") {
        password = password.slice(0, -1);
        return;
      }

      password += value;
    }

    process.stdin.on("data", handleInput);
  });
}

export async function main(argumentsList = process.argv.slice(2)) {
  const { email, username } = parseArguments(argumentsList);
  const password = await readHiddenPassword();
  const result = await provisionVerifiedTestProcurementOfficer({
    email,
    username,
    password,
  });

  if (!result.created) {
    console.error("Provisioning refused: that username or email is already in use.");
    process.exitCode = 1;
    return;
  }

  console.info(`Provisioned test procurement officer: ${result.user.username}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Provisioning failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
