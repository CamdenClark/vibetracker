import { defineConfig } from "drizzle-kit";
import { join } from "path";

const DEFAULT_DB_PATH = join(
  process.env.HOME || "",
  ".vibetracker",
  "transcripts.db"
);

export default defineConfig({
  schema: "./src/shared/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.VIBETRACKER_DB_PATH || DEFAULT_DB_PATH,
  },
});
