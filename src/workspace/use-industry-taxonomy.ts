import { useEffect, useState } from "react";
import { fetchIndustryTaxonomy } from "@/lib/project-api";
import {
  INDUSTRY_TAXONOMY,
  type IndustryTheme,
} from "@/workspace/industry-taxonomy";

/** 先用打包的 taxonomy.md，登录后若接口有更新的白名单则覆盖。 */
export function useIndustryTaxonomy(): IndustryTheme[] {
  const [themes, setThemes] = useState<IndustryTheme[]>(INDUSTRY_TAXONOMY);

  useEffect(() => {
    let cancelled = false;
    void fetchIndustryTaxonomy()
      .then((rows) => {
        if (!cancelled && rows.length > 0) setThemes(rows);
      })
      .catch(() => {
        /* 无后端或未登录时沿用打包白名单 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return themes;
}
