import {
  Job,
  Pipeline,
  Secret,
} from "https://deno.land/x/cicada@v0.1.50/mod.ts";
import $ from "https://deno.land/x/dax@0.31.1/mod.ts";

const secrets = [
  "PRIVATE_KEY",
  "OPENAI_API_KEY",
  "CODECOV_TOKEN",
].map((name) => new Secret(name));

const test = new Job({
  name: "Test",
  image: "denoland/deno:1.33.3",
  steps: [
    {
      name: "Create .env",
      run: async () => {
        const lines = await Promise.all(
          secrets.map(async (secret) =>
            `${secret.name}=${await secret.value()}`
          ),
        );
        await Deno.writeTextFile(".env", lines.join("\n"));
      },
      secrets,
    },
    {
      name: "Format",
      run: "deno fmt --check",
    },
    {
      name: "Lint",
      run: "deno lint",
    },
    {
      name: "Test",
      run: "deno test -A --quiet --coverage=/app/coverage",
    },
    {
      name: "Upload coverage to Codecov",
      run: async () => {
        const secret = secrets.find((secret) =>
          secret.name === "CODECOV_TOKEN"
        );
        if (!secret) {
          throw new Error("CODECOV_TOKEN not found");
        }
        const res = await fetch(
          "https://uploader.codecov.io/latest/linux/codecov",
        );
        await Deno.writeFile(
          "./codecov",
          new Uint8Array(await res.arrayBuffer()),
        );
        await $`chmod +x ./codecov`;
        await $`./codecov -t ${await secret.value()} -f /app/coverage`;
      },
      secrets,
    },
  ],
});

export default new Pipeline([test], {
  name: "CI",
  on: {
    push: ["main"],
    pullRequest: ["main"],
  },
});
