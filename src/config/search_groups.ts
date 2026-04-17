import { z } from "zod";
import { parse as parseYaml } from "yaml";

const GroupSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().min(1).max(10),
  districts: z.array(z.string()).min(1),
  search_urls: z.array(z.string().url()).min(1),
  note: z.string().optional(),
});

const RootSchema = z.array(GroupSchema).min(1);

export type SearchGroup = z.infer<typeof GroupSchema>;

export function parseSearchGroups(raw: string): SearchGroup[] {
  const parsed = parseYaml(raw);
  return RootSchema.parse(parsed);
}
