-- Lot 29 (recherche) : extension pg_trgm, pour les index de recherche par morceau de mot (ilike '%...%').
-- SQL personnalisé : pg_trgm est une extension « de confiance » de PostgreSQL 17 (le propriétaire de la base peut la créer).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
