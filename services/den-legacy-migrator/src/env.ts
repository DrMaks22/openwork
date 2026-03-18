import { z } from "zod"

const schema = z.object({
  LEGACY_DATABASE_URL: z.string().min(1),
  TARGET_DB_MODE: z.enum(["mysql", "planetscale"]).optional(),
  TARGET_DATABASE_URL: z.string().optional(),
  TARGET_DATABASE_HOST: z.string().optional(),
  TARGET_DATABASE_USERNAME: z.string().optional(),
  TARGET_DATABASE_PASSWORD: z.string().optional(),
  APP_USERNAME: z.string().min(1),
  APP_PASSWORD: z.string().min(1),
  PORT: z.string().optional(),
  LIST_USERS_LIMIT: z.string().optional(),
}).superRefine((value, ctx) => {
  const mode = value.TARGET_DB_MODE ?? (value.TARGET_DATABASE_URL ? "mysql" : "planetscale")

  if (mode === "mysql" && !value.TARGET_DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TARGET_DATABASE_URL is required when TARGET_DB_MODE=mysql",
      path: ["TARGET_DATABASE_URL"],
    })
  }

  if (mode === "planetscale") {
    for (const key of ["TARGET_DATABASE_HOST", "TARGET_DATABASE_USERNAME", "TARGET_DATABASE_PASSWORD"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is required when TARGET_DB_MODE=planetscale`,
          path: [key],
        })
      }
    }
  }
})

const parsed = schema.parse(process.env)

export const env = {
  legacyDatabaseUrl: parsed.LEGACY_DATABASE_URL,
  target: {
    mode: parsed.TARGET_DB_MODE ?? (parsed.TARGET_DATABASE_URL ? "mysql" : "planetscale"),
    databaseUrl: parsed.TARGET_DATABASE_URL,
    planetscale: parsed.TARGET_DATABASE_HOST && parsed.TARGET_DATABASE_USERNAME && parsed.TARGET_DATABASE_PASSWORD !== undefined
      ? {
          host: parsed.TARGET_DATABASE_HOST,
          username: parsed.TARGET_DATABASE_USERNAME,
          password: parsed.TARGET_DATABASE_PASSWORD,
        }
      : null,
  },
  auth: {
    username: parsed.APP_USERNAME,
    password: parsed.APP_PASSWORD,
  },
  port: Number(parsed.PORT ?? "8791"),
  listUsersLimit: Number(parsed.LIST_USERS_LIMIT ?? "250"),
}
