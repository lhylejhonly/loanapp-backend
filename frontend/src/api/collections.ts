export type ApiListPayload<T> =
  | T[]
  | {
      count?: number;
      next?: string | null;
      previous?: string | null;
      results?: T[] | null;
    };

export const extractCollection = <T>(payload: ApiListPayload<T> | null | undefined): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.results) ? payload.results : [];
};
