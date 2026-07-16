import { useCallback, useEffect, useState } from "react";
import * as api from "../api/client";
import type { ProductionBlueprint, ResourceCatalogEntry } from "../api/types";

// Kepler-proxied reference data, fetched when the Catalog view first mounts
// and cached for the session. A 502 (Kepler unreachable) surfaces as `error`
// with a retry, rather than degrading the whole dashboard.

type CatalogData = {
  blueprints: ProductionBlueprint[];
  resources: ResourceCatalogEntry[];
};

let cache: CatalogData | null = null;

export function useCatalog(): CatalogData & {
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<CatalogData | null>(cache);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [blueprints, resources] = await Promise.all([
        api.getBlueprints(),
        api.getResources(),
      ]);
      cache = {
        blueprints: blueprints.blueprints,
        resources: resources.resources,
      };
      setData(cache);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cache === null) void fetchCatalog();
  }, [fetchCatalog]);

  return {
    blueprints: data?.blueprints ?? [],
    resources: data?.resources ?? [],
    loading,
    error,
    refetch: () => void fetchCatalog(),
  };
}
