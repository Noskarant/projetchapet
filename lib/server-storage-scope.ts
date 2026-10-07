import { OrganizationAuthError } from "./server-organization";

/** Database references remain untrusted when a service key signs/deletes files. */
export function assertOrganizationStoragePath(organizationId: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.startsWith(`${organizationId}/`)
      || /%(?:25)*(?:2e|2f|5c)/i.test(value)
      || !new URL(`https://storage.invalid/object/sign/scoped/${value}`).pathname.startsWith(`/object/sign/scoped/${organizationId}/`)) {
    throw new OrganizationAuthError("Chemin de pièce jointe non autorisé.", 403);
  }
}
