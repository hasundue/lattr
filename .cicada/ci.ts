import { Job, Pipeline, } from "https://deno.land/x/cicada@v0.1.50/mod.ts";

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
      name: "Test",
      run: "deno test -A --quiet --coverage=./coverage",
    },
    {
      name: "Upload coverage",
      run: "curl -Os https://uploader.codecov.io/latest/linux/codecov && chmod +x codecov && ./codecov",
    },
  ],
});

export default new Pipeline([test], {
  name: "CI",
  on: {
    pullRequest: ["main"],
  },
});
