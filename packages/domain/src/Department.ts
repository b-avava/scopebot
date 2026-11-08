import { Schema } from "effect"

export const DepartmentId = Schema.String.pipe(Schema.brand("DepartmentId"))
export type DepartmentId = typeof DepartmentId.Type

/** What can change about a department. */
export const DepartmentDetails = Schema.Struct({
  name: Schema.NonEmptyString
})
export type DepartmentDetails = typeof DepartmentDetails.Type

/** A group of employees. */
export const Department = Schema.Struct({
  id: DepartmentId,
  ...DepartmentDetails.fields,
  createdAt: Schema.String
})
export type Department = typeof Department.Type

export class DepartmentNotFound extends Schema.TaggedError<DepartmentNotFound>()(
  "DepartmentNotFound",
  {},
  { httpApiStatus: 404 }
) {}
