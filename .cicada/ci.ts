import {
  Job,
  Pipeline,
  Secret,
} from "https://deno.land/x/cicada@v0.1.50/mod.ts";

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
      name: "Format",
      run: "deno fmt --check",
    },
    {
      name: "Lint",
      run: "deno lint",
    },
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
      name: "Test",
      run: "deno test -A --quiet --coverage=./coverage",
    },
    {
      name: "Upload coverage",
      run:
        "curl -Os https://uploader.codecov.io/latest/linux/codecov && chmod +x codecov && ./codecov",
    },
  ],
});

export default new Pipeline([test], {
  name: "CI",
  on: {
    pullRequest: "all",
  },
});
