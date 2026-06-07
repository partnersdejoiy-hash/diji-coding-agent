export function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function getWorkspaceId(params: Record<string, string | string[] | undefined>): string {
  return getParam(params.workspaceId ?? params.id);
}
