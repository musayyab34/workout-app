/* eslint-disable @typescript-eslint/no-require-imports -- schema generator uses the local TypeScript hook */
require("./register-ts.cjs");
const fs = require("node:fs");
const { z } = require("zod");
const domain = require("../src/domain/schemas.ts");
const { personalProgramSchema } = require("../src/domain/programs.ts");
let sql = "";
for (const [kind, schema] of Object.entries({
  session: domain.sessionSchema,
  program: personalProgramSchema,
  preferences: domain.preferencesSchema,
})) {
  const json = z.toJSONSchema(schema, {
    unrepresentable: "any",
    reused: "inline",
  });
  sql +=
    "insert into private.form_schemas values ('" +
    kind +
    "','" +
    JSON.stringify(json).replaceAll("'", "''") +
    "'::jsonb) on conflict(kind) do update set document=excluded.document;\n";
}
const output = process.argv[2];
if (!output)
  throw new Error(
    "Provide an output SQL path; review and use a NEW migration for changes to deployed schemas.",
  );
fs.writeFileSync(output, sql);
console.log(
  "Generated shared document schemas. Review semantic validators separately.",
);
