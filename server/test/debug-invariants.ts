import { SQL } from "bun";
const sql = new SQL(process.env.DATABASE_URL!);
const rows = await sql`SELECT id, target_key, bounty_amount FROM invariants`;
console.log(JSON.stringify(rows, null, 2));
await sql.end();
