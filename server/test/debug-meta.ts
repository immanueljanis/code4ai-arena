import { getTargetMeta } from "../src/contests.ts";
const meta = getTargetMeta("access-control-vault");
console.log(JSON.stringify(meta, null, 2));
