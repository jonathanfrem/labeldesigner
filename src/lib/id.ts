function randomToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export function newTemplateId(): string {
  return `custom-${randomToken()}`;
}

export function newElementId(): string {
  return `el-${randomToken()}`;
}
