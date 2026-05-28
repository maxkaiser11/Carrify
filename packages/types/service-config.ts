import { z } from 'zod';

// Describes the form a buyer fills in when configuring a service.
// Persisted in Service.configSchema; rendered by the web app's order builder.
const fieldBase = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(false),
});

export const ConfigField = z.discriminatedUnion('type', [
  fieldBase.extend({ type: z.literal('rank') }),
  fieldBase.extend({ type: z.literal('boolean'), default: z.boolean().optional() }),
  fieldBase.extend({
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.number().optional(),
  }),
  fieldBase.extend({
    type: z.literal('string'),
    maxLength: z.number().int().positive().optional(),
    default: z.string().optional(),
  }),
  fieldBase.extend({
    type: z.literal('enum'),
    options: z.array(z.string()).min(1),
    default: z.string().optional(),
  }),
]);
export type ConfigField = z.infer<typeof ConfigField>;

export const ServiceConfigSchema = z.object({
  fields: z.array(ConfigField).min(1),
});
export type ServiceConfigSchema = z.infer<typeof ServiceConfigSchema>;
