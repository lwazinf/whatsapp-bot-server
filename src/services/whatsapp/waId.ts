export const normalizeWaId = (value: string): string => value.replace(/[^\d]/g, '');

export const isSameWaId = (left: string, right: string): boolean =>
    normalizeWaId(left) === normalizeWaId(right);
