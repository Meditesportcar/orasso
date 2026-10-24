-- Lot R1, tour 2 : recherche sans accents ni casse, indexée. `orasso_fold` = minuscules sans accents, comme `fold`
-- de l'API (lib/text-search.ts, parité testée) : `translate` des deux casses (indépendant de la locale), puis `lower`.
-- IMMUTABLE : elle porte les index trigrammes ci-dessous, et les requêtes l'appellent telle quelle pour s'en servir.
CREATE OR REPLACE FUNCTION orasso_fold(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(translate(t, 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ', 'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuyy'))
$$;
--> statement-breakpoint
CREATE INDEX "events_title_fold_trgm_idx" ON "events" USING gin (orasso_fold("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_city_fold_trgm_idx" ON "events" USING gin (orasso_fold("city") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_address_fold_trgm_idx" ON "events" USING gin (orasso_fold("address_line") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "structures_name_fold_trgm_idx" ON "structures" USING gin (orasso_fold("name") gin_trgm_ops);