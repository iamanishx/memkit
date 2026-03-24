import { z } from "zod"

export function zodToJsonSchema(schema: z.ZodObject<any>): Record<string, any> {
  const shape = schema.shape
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const field = value as z.ZodTypeAny
    const isOptional = field instanceof z.ZodOptional || field instanceof z.ZodDefault
    const inner = isOptional
      ? field instanceof z.ZodOptional
        ? (field as z.ZodOptional<any>).unwrap()
        : (field as z.ZodDefault<any>)._def.innerType
      : field

    const prop: Record<string, any> = {}
    if (inner instanceof z.ZodString) prop.type = "string"
    else if (inner instanceof z.ZodNumber) prop.type = "number"
    else if (inner instanceof z.ZodBoolean) prop.type = "boolean"
    else if (inner instanceof z.ZodRecord) prop.type = "object"
    else prop.type = "string"

    const desc = (field as any)._def?.description
    if (desc) prop.description = desc
    if (field instanceof z.ZodDefault) prop.default = (field as z.ZodDefault<any>)._def.defaultValue()

    properties[key] = prop
    if (!isOptional) required.push(key)
  }

  return { type: "object", properties, required }
}
